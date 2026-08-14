"""
Tests for: (1) gated /api/auth/dev-login (domain + ENABLE_DEV_LOGIN restriction),
(2) admin auth gating (get_current_admin / is_admin flag), (3) /api/admin/* CRUD routes.

Admin user (nextleveldev@gmail.com) is NOT reachable via dev-login (blocked by design -
real gmail domain). To exercise admin-only routes, we insert a temporary user + session
doc directly into MongoDB, run tests, then fully clean up (matches the review-request
requirement to not leave placeholder data under the real admin email).
"""
import os
import uuid
import secrets
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

from pathlib import Path


def _env_value(env_path: str, key: str) -> str:
    p = Path(env_path)
    for line in p.read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError(f"{key} not found in {env_path}")


BASE_URL = _env_value("/app/frontend/.env", "EXPO_PUBLIC_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = _env_value("/app/backend/.env", "ADMIN_EMAILS").split(",")[0].strip()


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(_env_value("/app/backend/.env", "MONGO_URL"))
    db = client[_env_value("/app/backend/.env", "DB_NAME")]
    yield db
    client.close()


@pytest.fixture()
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture()
def dev_token(api_client):
    """A normal @mtree.dev dev-login user/token (non-admin)."""
    email = f"TEST_admintest_{uuid.uuid4().hex[:8]}@mtree.dev"
    r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Admin Test User"})
    assert r.status_code == 200
    data = r.json()
    token = data["session_token"]
    yield token
    # cleanup handled by session-wide conftest purge (matches @mtree.dev pattern)


@pytest.fixture()
def admin_token(mongo_db):
    """Attach a temp session_token to the real, pre-existing admin user doc (does NOT
    create/modify the user doc itself - only inserts a throwaway session, deleted after).
    The real admin (ADMIN_EMAIL, from ADMIN_EMAILS env) must already exist in the DB via
    real Google OAuth sign-in - dev-login can't reach this non-@mtree.dev address."""
    existing = mongo_db.users.find_one({"email": ADMIN_EMAIL})
    assert existing, f"expected real admin user {ADMIN_EMAIL} to already exist in DB"
    user_id = existing["user_id"]
    now = datetime.now(timezone.utc)
    token = f"devtok_{secrets.token_urlsafe(32)}"
    mongo_db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "created_at": now, "expires_at": now + timedelta(days=1),
    })
    yield token
    mongo_db.user_sessions.delete_one({"session_token": token})


class TestDevLoginGating:
    def test_dev_login_rejects_non_mtree_domain(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": "hacker@evil.com", "name": "Hacker"})
        assert r.status_code == 403

    def test_dev_login_accepts_mtree_dev_domain(self, api_client):
        email = f"TEST_gate_{uuid.uuid4().hex[:8]}@mtree.dev"
        r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Gate Test"})
        assert r.status_code == 200
        data = r.json()
        assert "session_token" in data
        assert data["user"]["email"] == email


class TestAdminAuthGate:
    def test_me_is_admin_false_for_regular_user(self, api_client, dev_token):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {dev_token}"})
        assert r.status_code == 200
        assert r.json().get("is_admin") in (False, None)

    def test_me_is_admin_true_for_admin_user(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["is_admin"] is True
        assert data["email"] == ADMIN_EMAIL

    def test_admin_stats_403_for_non_admin(self, api_client, dev_token):
        r = api_client.get(f"{BASE_URL}/api/admin/stats", headers={"Authorization": f"Bearer {dev_token}"})
        assert r.status_code == 403

    def test_admin_users_403_for_non_admin(self, api_client, dev_token):
        r = api_client.get(f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {dev_token}"})
        assert r.status_code == 403

    def test_admin_manifestations_403_for_non_admin(self, api_client, dev_token):
        r = api_client.get(f"{BASE_URL}/api/admin/manifestations", headers={"Authorization": f"Bearer {dev_token}"})
        assert r.status_code == 403

    def test_admin_route_401_for_no_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code == 401


class TestAdminStats:
    def test_stats_shape(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/api/admin/stats", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        for key in ["total_users", "premium_users", "total_manifestations",
                    "active_manifestations", "completed_manifestations", "wall_posts"]:
            assert key in data
            assert isinstance(data[key], int)
        assert data["total_users"] >= 1


class TestAdminUsers:
    def test_list_users_shape(self, api_client, admin_token, dev_token):
        r = api_client.get(f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and "users" in data
        assert isinstance(data["users"], list)

    def test_search_by_name_substring(self, api_client, admin_token):
        unique_name = f"ZzzSearchTest{uuid.uuid4().hex[:6]}"
        email = f"TEST_search_{uuid.uuid4().hex[:8]}@mtree.dev"
        r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": unique_name})
        assert r.status_code == 200
        r2 = api_client.get(f"{BASE_URL}/api/admin/users", params={"search": unique_name},
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r2.status_code == 200
        data = r2.json()
        assert data["total"] == 1
        assert data["users"][0]["email"] == email

    def test_search_by_email_substring(self, api_client, admin_token):
        email_frag = f"TEST_emailsearch_{uuid.uuid4().hex[:8]}"
        email = f"{email_frag}@mtree.dev"
        r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Email Search"})
        assert r.status_code == 200
        r2 = api_client.get(f"{BASE_URL}/api/admin/users", params={"search": email_frag},
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r2.status_code == 200
        assert r2.json()["total"] == 1

    def test_get_user_detail_with_manifestations(self, api_client, admin_token, dev_token):
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {dev_token}"}).json()
        uid = me["user_id"]
        r = api_client.get(f"{BASE_URL}/api/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["user_id"] == uid
        assert "manifestations" in data
        assert isinstance(data["manifestations"], list)

    def test_get_user_detail_404_for_missing(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/api/admin/users/nonexistent_uid_xyz",
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404

    def test_toggle_premium_off_then_on(self, api_client, admin_token, dev_token):
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {dev_token}"}).json()
        uid = me["user_id"]
        assert me["is_premium"] is True  # dev-login users default premium

        r = api_client.patch(f"{BASE_URL}/api/admin/users/{uid}", json={"is_premium": False},
                              headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert r.json()["is_premium"] is False

        # verify persisted via GET
        g = api_client.get(f"{BASE_URL}/api/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"})
        assert g.json()["user"]["is_premium"] is False

        r2 = api_client.patch(f"{BASE_URL}/api/admin/users/{uid}", json={"is_premium": True},
                               headers={"Authorization": f"Bearer {admin_token}"})
        assert r2.status_code == 200
        assert r2.json()["is_premium"] is True

    def test_delete_user_cascades(self, api_client, admin_token):
        email = f"TEST_delcascade_{uuid.uuid4().hex[:8]}@mtree.dev"
        r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Del Cascade"})
        token = r.json()["session_token"]
        uid = r.json()["user"]["user_id"]

        # create a manifestation for this user
        payload = {
            "goal_category": "custom", "goal_custom": "Test goal", "sacrifice_category": "custom",
            "sacrifice_custom": "Test sac", "cycle_days": 21,
        }
        mr = api_client.post(f"{BASE_URL}/api/manifestations", json=payload,
                              headers={"Authorization": f"Bearer {token}"})
        assert mr.status_code == 200

        d = api_client.delete(f"{BASE_URL}/api/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"})
        assert d.status_code == 200

        # verify user + session gone -> /auth/me with old token now 401
        m = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert m.status_code == 401

        # verify admin get returns 404
        g = api_client.get(f"{BASE_URL}/api/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"})
        assert g.status_code == 404

    def test_delete_user_404_for_missing(self, api_client, admin_token):
        r = api_client.delete(f"{BASE_URL}/api/admin/users/nonexistent_uid_xyz",
                               headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404


class TestAdminManifestations:
    def test_list_manifestations_filtered(self, api_client, admin_token, dev_token):
        # create + complete a manifestation for wall visibility
        payload = {
            "goal_category": "custom", "goal_custom": "Wall goal", "sacrifice_category": "custom",
            "sacrifice_custom": "Wall sac", "cycle_days": 7, "is_public": True,
        }
        mr = api_client.post(f"{BASE_URL}/api/manifestations", json=payload,
                              headers={"Authorization": f"Bearer {dev_token}"})
        mid = mr.json()["id"]
        fin = api_client.post(f"{BASE_URL}/api/manifestations/{mid}/manifested", json={"testimony": "done", "donation_amount": 0},
                               headers={"Authorization": f"Bearer {dev_token}"})
        assert fin.status_code == 200

        r = api_client.get(f"{BASE_URL}/api/admin/manifestations", params={"status_filter": "manifested"},
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and "items" in data
        ids = [i["id"] for i in data["items"]]
        assert mid in ids

    def test_delete_manifestation(self, api_client, admin_token, dev_token):
        payload = {
            "goal_category": "custom", "goal_custom": "Delme goal", "sacrifice_category": "custom",
            "sacrifice_custom": "Delme sac", "cycle_days": 7,
        }
        mr = api_client.post(f"{BASE_URL}/api/manifestations", json=payload,
                              headers={"Authorization": f"Bearer {dev_token}"})
        mid = mr.json()["id"]

        d = api_client.delete(f"{BASE_URL}/api/admin/manifestations/{mid}", headers={"Authorization": f"Bearer {admin_token}"})
        assert d.status_code == 200

        r = api_client.get(f"{BASE_URL}/api/admin/manifestations", params={"limit": 100},
                            headers={"Authorization": f"Bearer {admin_token}"})
        ids = [i["id"] for i in r.json()["items"]]
        assert mid not in ids

    def test_delete_manifestation_404_for_missing(self, api_client, admin_token):
        r = api_client.delete(f"{BASE_URL}/api/admin/manifestations/nonexistent_mid_xyz",
                               headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404
