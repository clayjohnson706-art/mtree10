"""
Tests for the Admin Panel block/unblock feature added in this iteration:
- POST /api/admin/users/{user_id}/block  (temporary via days, or permanent when omitted)
- POST /api/admin/users/{user_id}/unblock
- get_current_user block enforcement (403 for blocked users, auto-unblock on expiry)
- admin-auth gating on both new endpoints

Admin user (nextleveldev706@gmail.com) is NOT reachable via dev-login (blocked by design -
real gmail domain). We insert a temporary user + session doc directly into MongoDB for the
admin, run tests, then fully clean up.
"""
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
def dev_user(api_client):
    """A normal @mtree.dev dev-login user (non-admin) - returns (token, user_id)."""
    email = f"TEST_blocktest_{uuid.uuid4().hex[:8]}@mtree.dev"
    r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Block Test User"})
    assert r.status_code == 200
    data = r.json()
    yield data["session_token"], data["user"]["user_id"]


@pytest.fixture()
def admin_token(mongo_db):
    """Attach a temp session_token to the real, pre-existing admin user doc (does NOT
    create/modify the user doc itself - only inserts a throwaway session, deleted after)."""
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


class TestBlockUnblockAuthGate:
    def test_block_403_for_non_admin(self, api_client, dev_user):
        token, uid = dev_user
        r = api_client.post(f"{BASE_URL}/api/admin/users/{uid}/block", json={"days": 1},
                             headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403

    def test_unblock_403_for_non_admin(self, api_client, dev_user):
        token, uid = dev_user
        r = api_client.post(f"{BASE_URL}/api/admin/users/{uid}/unblock",
                             headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403

    def test_block_401_for_no_token(self, api_client, dev_user):
        _, uid = dev_user
        r = api_client.post(f"{BASE_URL}/api/admin/users/{uid}/block", json={"days": 1})
        assert r.status_code == 401


class TestPermanentBlock:
    def test_permanent_block_sets_flags(self, api_client, admin_token, dev_user, mongo_db):
        _, uid = dev_user
        r = api_client.post(f"{BASE_URL}/api/admin/users/{uid}/block", json={"days": None},
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["is_blocked"] is True
        assert data.get("blocked_until") is None

        # verify persisted
        doc = mongo_db.users.find_one({"user_id": uid})
        assert doc["is_blocked"] is True
        assert doc["blocked_until"] is None

    def test_blocked_user_gets_403_with_blocked_message(self, api_client, admin_token, dev_user):
        token, uid = dev_user
        api_client.post(f"{BASE_URL}/api/admin/users/{uid}/block", json={"days": None},
                         headers={"Authorization": f"Bearer {admin_token}"})
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403
        assert "blocked" in r.json()["detail"].lower()

    def test_unblock_restores_access(self, api_client, admin_token, dev_user):
        token, uid = dev_user
        api_client.post(f"{BASE_URL}/api/admin/users/{uid}/block", json={"days": None},
                         headers={"Authorization": f"Bearer {admin_token}"})
        blocked_check = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert blocked_check.status_code == 403

        r = api_client.post(f"{BASE_URL}/api/admin/users/{uid}/unblock",
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["is_blocked"] is False
        assert data.get("blocked_until") is None

        me = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["is_blocked"] is False


class TestTemporaryBlock:
    def test_temporary_block_sets_future_blocked_until(self, api_client, admin_token, dev_user):
        _, uid = dev_user
        r = api_client.post(f"{BASE_URL}/api/admin/users/{uid}/block", json={"days": 7},
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["is_blocked"] is True
        assert data.get("blocked_until") is not None
        until_str = data["blocked_until"]
        until = datetime.fromisoformat(until_str)
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        assert now + timedelta(days=6) < until < now + timedelta(days=8)

    def test_temporary_block_denies_access_while_active(self, api_client, admin_token, dev_user):
        token, uid = dev_user
        api_client.post(f"{BASE_URL}/api/admin/users/{uid}/block", json={"days": 1},
                         headers={"Authorization": f"Bearer {admin_token}"})
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403
        assert "blocked" in r.json()["detail"].lower()

    def test_expired_temp_block_auto_unblocks_on_next_request(self, api_client, admin_token, dev_user, mongo_db):
        """Block with days=1, then manually set blocked_until to the past in Mongo,
        then call /auth/me and confirm 200 + is_blocked:false (auto-unblock)."""
        token, uid = dev_user
        api_client.post(f"{BASE_URL}/api/admin/users/{uid}/block", json={"days": 1},
                         headers={"Authorization": f"Bearer {admin_token}"})
        # Sanity: currently blocked
        blocked_check = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert blocked_check.status_code == 403

        # Manually push blocked_until into the past
        past = datetime.now(timezone.utc) - timedelta(days=1)
        mongo_db.users.update_one({"user_id": uid}, {"$set": {"blocked_until": past}})

        r = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["is_blocked"] is False

        # verify persisted in DB too
        doc = mongo_db.users.find_one({"user_id": uid})
        assert doc["is_blocked"] is False
        assert doc["blocked_until"] is None


class TestBlockUnblock404:
    def test_block_404_for_missing_user(self, api_client, admin_token):
        r = api_client.post(f"{BASE_URL}/api/admin/users/nonexistent_uid_xyz/block", json={"days": 1},
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404

    def test_unblock_404_for_missing_user(self, api_client, admin_token):
        r = api_client.post(f"{BASE_URL}/api/admin/users/nonexistent_uid_xyz/unblock",
                             headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 404
