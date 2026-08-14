"""
Tests for round-5 Admin Panel full-screen user detail control panel additions:
- PATCH /admin/users/{id} now accepts `name`
- POST /admin/users/{id}/extend-premium (stacking logic)
- POST /admin/users/{id}/revoke-premium
- POST /admin/users/{id}/force-logout (session revocation)
- GET /admin/users/{id} manifestations array (regression)
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


def _parse_dt(s: str) -> datetime:
    """Server may return naive-UTC ISO strings (Mongo strips tzinfo) or aware ones - normalize to aware UTC."""
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


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
def admin_token(mongo_db):
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


@pytest.fixture()
def test_user(api_client):
    """Fresh @mtree.dev dev-login user + token for each test needing an isolated user."""
    email = f"TEST_ud_{uuid.uuid4().hex[:8]}@mtree.dev"
    r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Detail Test User"})
    assert r.status_code == 200
    data = r.json()
    return {"token": data["session_token"], "user_id": data["user"]["user_id"], "email": email}


class TestAdminRenameUser:
    def test_patch_name_updates_and_persists(self, api_client, admin_token, test_user):
        r = api_client.patch(f"{BASE_URL}/api/admin/users/{test_user['user_id']}", json={"name": "Renamed Person"},
                              headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed Person"

        g = api_client.get(f"{BASE_URL}/api/admin/users/{test_user['user_id']}",
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert g.status_code == 200
        assert g.json()["user"]["name"] == "Renamed Person"


class TestAdminExtendRevokePremium:
    def test_extend_premium_from_not_premium_sets_expiry_from_now(self, api_client, admin_token, test_user):
        # dev-login users default is_premium=True with no expiry; revoke first for a clean baseline
        rv = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/revoke-premium",
                              headers={"Authorization": f"Bearer {admin_token}"})
        assert rv.status_code == 200
        assert rv.json()["is_premium"] is False
        assert rv.json()["premium_expires_at"] is None

        before = datetime.now(timezone.utc)
        r = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/extend-premium", json={"days": 7},
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["is_premium"] is True
        expiry = _parse_dt(data["premium_expires_at"])
        expected = before + timedelta(days=7)
        assert abs((expiry - expected).total_seconds()) < 60

    def test_extend_premium_stacks_on_future_expiry(self, api_client, admin_token, test_user):
        r1 = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/extend-premium", json={"days": 30},
                              headers={"Authorization": f"Bearer {admin_token}"})
        assert r1.status_code == 200
        expiry1 = _parse_dt(r1.json()["premium_expires_at"])

        r2 = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/extend-premium", json={"days": 7},
                              headers={"Authorization": f"Bearer {admin_token}"})
        assert r2.status_code == 200
        expiry2 = _parse_dt(r2.json()["premium_expires_at"])

        # Stacked: expiry2 should be ~7 days after expiry1, not 7 days from now
        diff = (expiry2 - expiry1).total_seconds()
        assert abs(diff - timedelta(days=7).total_seconds()) < 60

    def test_extend_premium_on_expired_resets_from_now(self, api_client, admin_token, test_user, mongo_db):
        # Force an expired premium state directly in Mongo
        past = datetime.now(timezone.utc) - timedelta(days=5)
        mongo_db.users.update_one({"user_id": test_user["user_id"]}, {"$set": {"is_premium": True, "premium_expires_at": past}})

        before = datetime.now(timezone.utc)
        r = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/extend-premium", json={"days": 10},
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        expiry = _parse_dt(r.json()["premium_expires_at"])
        expected = before + timedelta(days=10)
        assert abs((expiry - expected).total_seconds()) < 60

    def test_revoke_premium_clears_flag_and_expiry(self, api_client, admin_token, test_user):
        api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/extend-premium", json={"days": 30},
                         headers={"Authorization": f"Bearer {admin_token}"})
        r = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/revoke-premium",
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        assert r.json()["is_premium"] is False
        assert r.json()["premium_expires_at"] is None

        g = api_client.get(f"{BASE_URL}/api/admin/users/{test_user['user_id']}",
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert g.json()["user"]["is_premium"] is False

    def test_extend_premium_404_for_missing_user(self, api_client, admin_token):
        r = api_client.post(f"{BASE_URL}/api/admin/users/nonexistent_uid_xyz/extend-premium", json={"days": 7},
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404

    def test_revoke_premium_404_for_missing_user(self, api_client, admin_token):
        r = api_client.post(f"{BASE_URL}/api/admin/users/nonexistent_uid_xyz/revoke-premium",
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404


class TestAdminForceLogout:
    def test_force_logout_revokes_sessions_and_old_token_401s(self, api_client, admin_token, test_user):
        # sanity: token works before logout
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {test_user['token']}"})
        assert me.status_code == 200

        r = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/force-logout",
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["sessions_revoked"] >= 1

        me2 = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {test_user['token']}"})
        assert me2.status_code == 401

    def test_force_logout_zero_sessions_for_already_logged_out(self, api_client, admin_token, test_user):
        api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/force-logout",
                         headers={"Authorization": f"Bearer {admin_token}"})
        r2 = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/force-logout",
                              headers={"Authorization": f"Bearer {admin_token}"})
        assert r2.status_code == 200
        assert r2.json()["sessions_revoked"] == 0

    def test_force_logout_403_for_non_admin(self, api_client, test_user):
        r = api_client.post(f"{BASE_URL}/api/admin/users/{test_user['user_id']}/force-logout",
                             headers={"Authorization": f"Bearer {test_user['token']}"})
        assert r.status_code == 403


class TestAdminUserDetailManifestations:
    def test_manifestations_array_included_and_matches(self, api_client, admin_token, test_user):
        payload = {
            "goal_category": "custom", "goal_custom": "UD goal", "sacrifice_category": "custom",
            "sacrifice_custom": "UD sac", "cycle_days": 14,
        }
        mr = api_client.post(f"{BASE_URL}/api/manifestations", json=payload,
                              headers={"Authorization": f"Bearer {test_user['token']}"})
        assert mr.status_code == 200
        mid = mr.json()["id"]

        g = api_client.get(f"{BASE_URL}/api/admin/users/{test_user['user_id']}",
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert g.status_code == 200
        data = g.json()
        ids = [m["id"] for m in data["manifestations"]]
        assert mid in ids

    def test_delete_manifestation_via_admin_removes_from_detail(self, api_client, admin_token, test_user):
        payload = {
            "goal_category": "custom", "goal_custom": "UD goal2", "sacrifice_category": "custom",
            "sacrifice_custom": "UD sac2", "cycle_days": 14,
        }
        mr = api_client.post(f"{BASE_URL}/api/manifestations", json=payload,
                              headers={"Authorization": f"Bearer {test_user['token']}"})
        mid = mr.json()["id"]

        d = api_client.delete(f"{BASE_URL}/api/admin/manifestations/{mid}",
                               headers={"Authorization": f"Bearer {admin_token}"})
        assert d.status_code == 200

        g = api_client.get(f"{BASE_URL}/api/admin/users/{test_user['user_id']}",
                            headers={"Authorization": f"Bearer {admin_token}"})
        ids = [m["id"] for m in g.json()["manifestations"]]
        assert mid not in ids
