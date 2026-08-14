"""
Tests for the admin-account protection guard added on top of the Admin Panel:
- GET /api/admin/users must exclude any ADMIN_EMAILS user from the list (even with search).
- All mutating admin endpoints (delete/block/unblock/patch/extend-premium/revoke-premium/
  force-logout) must 400 when targeting an admin user_id, even if the id is directly known.
- GET /api/admin/users/{id} (read-only) should still work for an admin's own id.
- Regression: normal users must still be fully manageable as before.
"""
import os
import secrets
import asyncio
import pytest
import requests
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient

def _load_backend_url():
    val = os.environ.get('EXPO_BACKEND_URL') or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    if val:
        return val
    from pathlib import Path
    env_path = Path(__file__).resolve().parents[2] / 'frontend' / '.env'
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line.startswith('EXPO_PUBLIC_BACKEND_URL=') or line.startswith('EXPO_BACKEND_URL='):
            return line.split('=', 1)[1].strip().strip('"')
    raise RuntimeError("Backend URL not found in env")


BASE_URL = _load_backend_url().rstrip('/')

ADMIN_EMAIL = "nextleveldev706@gmail.com"
REAL_USER_EMAIL = "mjrd1402@gmail.com"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_token(db):
    """Insert a temp session doc for the EXISTING real admin user (do not create a duplicate
    user doc, do not touch the existing real session). Clean up after the module finishes."""
    admin_user = _run(db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0}))
    assert admin_user, "Admin user must already exist in DB"
    token = f"testtok_{secrets.token_urlsafe(24)}"
    now = datetime.now(timezone.utc)
    _run(db.user_sessions.insert_one({
        "session_token": token,
        "user_id": admin_user["user_id"],
        "created_at": now,
        "expires_at": now + timedelta(hours=1),
    }))
    yield token, admin_user["user_id"]
    _run(db.user_sessions.delete_one({"session_token": token}))


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    token, _ = admin_token
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def real_user_id(db):
    u = _run(db.users.find_one({"email": REAL_USER_EMAIL}, {"_id": 0}))
    assert u
    return u["user_id"]


@pytest.fixture()
def test_user(admin_headers):
    """A throwaway @mtree.dev user for full CRUD regression, created + deleted per test.
    Reuses the module-scoped admin_headers fixture (single temp admin session) for cleanup,
    instead of minting a new session_token doc per teardown."""
    email = f"TEST_guard_{secrets.token_hex(4)}@mtree.dev"
    r = requests.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "TEST Guard User"})
    assert r.status_code == 200
    data = r.json()
    user_id = data["user"]["user_id"]
    yield user_id
    requests.delete(f"{BASE_URL}/api/admin/users/{user_id}", headers=admin_headers)


class TestAdminListExcludesAdmins:
    def test_list_users_excludes_admin_email(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, params={"limit": 200})
        assert r.status_code == 200
        data = r.json()
        emails = [u["email"].lower() for u in data["users"]]
        assert ADMIN_EMAIL.lower() not in emails
        assert REAL_USER_EMAIL.lower() in emails

    def test_search_by_admin_name_or_email_returns_nothing(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, params={"search": "nextleveldev706"})
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 0
        assert data["users"] == []

    def test_search_admin_name_variant(self, admin_headers, db):
        admin_user = _run(db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0}))
        name = admin_user.get("name") or ""
        if name:
            r = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers, params={"search": name})
            assert r.status_code == 200
            emails = [u["email"].lower() for u in r.json()["users"]]
            assert ADMIN_EMAIL.lower() not in emails


class TestMutationGuardOnAdmin:
    def test_delete_admin_blocked(self, admin_headers, admin_token):
        _, admin_uid = admin_token
        r = requests.delete(f"{BASE_URL}/api/admin/users/{admin_uid}", headers=admin_headers)
        assert r.status_code == 400
        assert "admin" in r.json()["detail"].lower()

    def test_block_admin_blocked(self, admin_headers, admin_token):
        _, admin_uid = admin_token
        r = requests.post(f"{BASE_URL}/api/admin/users/{admin_uid}/block", headers=admin_headers, json={})
        assert r.status_code == 400

    def test_unblock_admin_blocked(self, admin_headers, admin_token):
        _, admin_uid = admin_token
        r = requests.post(f"{BASE_URL}/api/admin/users/{admin_uid}/unblock", headers=admin_headers)
        assert r.status_code == 400

    def test_patch_admin_blocked(self, admin_headers, admin_token):
        _, admin_uid = admin_token
        r = requests.patch(f"{BASE_URL}/api/admin/users/{admin_uid}", headers=admin_headers, json={"name": "Hacked"})
        assert r.status_code == 400

    def test_extend_premium_admin_blocked(self, admin_headers, admin_token):
        _, admin_uid = admin_token
        r = requests.post(f"{BASE_URL}/api/admin/users/{admin_uid}/extend-premium", headers=admin_headers, json={"days": 10})
        assert r.status_code == 400

    def test_revoke_premium_admin_blocked(self, admin_headers, admin_token):
        _, admin_uid = admin_token
        r = requests.post(f"{BASE_URL}/api/admin/users/{admin_uid}/revoke-premium", headers=admin_headers)
        assert r.status_code == 400

    def test_force_logout_admin_blocked(self, admin_headers, admin_token):
        _, admin_uid = admin_token
        r = requests.post(f"{BASE_URL}/api/admin/users/{admin_uid}/force-logout", headers=admin_headers)
        assert r.status_code == 400


class TestReadOnlyDetailStillWorksForAdmin:
    def test_get_admin_detail_ok(self, admin_headers, admin_token):
        _, admin_uid = admin_token
        r = requests.get(f"{BASE_URL}/api/admin/users/{admin_uid}", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["user_id"] == admin_uid
        assert data["user"]["email"].lower() == ADMIN_EMAIL.lower()
        assert data["user"]["is_admin"] is True


class TestAdminAccountUnaffected:
    def test_admin_still_intact(self, admin_headers, admin_token, db):
        _, admin_uid = admin_token
        u = _run(db.users.find_one({"user_id": admin_uid}, {"_id": 0}))
        assert u is not None
        assert not u.get("is_blocked")
        r = requests.get(f"{BASE_URL}/api/admin/users/{admin_uid}", headers=admin_headers)
        assert r.json()["user"]["is_admin"] is True


class TestNormalUserRegressionStillWorks:
    def test_full_crud_regression_on_test_user(self, admin_headers, test_user):
        uid = test_user

        # patch (rename)
        r = requests.patch(f"{BASE_URL}/api/admin/users/{uid}", headers=admin_headers, json={"name": "TEST Renamed"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST Renamed"

        # extend premium
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/extend-premium", headers=admin_headers, json={"days": 5})
        assert r.status_code == 200
        assert r.json()["is_premium"] is True

        # revoke premium
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/revoke-premium", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["is_premium"] is False

        # block
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/block", headers=admin_headers, json={})
        assert r.status_code == 200
        assert r.json()["is_blocked"] is True

        # unblock
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/unblock", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["is_blocked"] is False

        # force-logout
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/force-logout", headers=admin_headers)
        assert r.status_code == 200

        # delete (verify then via GET 404)
        r = requests.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=admin_headers)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/admin/users/{uid}", headers=admin_headers)
        assert r.status_code == 404
