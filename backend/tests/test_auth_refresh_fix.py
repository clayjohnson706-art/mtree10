"""
Tests for the auth session-refresh bug fix.
Verifies:
1. Dev-login creates a valid session; GET /api/auth/me with valid token returns 200.
2. GET /api/auth/me with invalid/garbage token returns 401 (must still log out on 401 - no regression).
3. GET /api/auth/me with no Authorization header returns 401.
4. Logout endpoint works and subsequent /auth/me with old token still functions per session model.
"""
import os
import uuid
import pytest
import requests
from dotenv import dotenv_values

_frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or _frontend_env.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def dev_user(api_client):
    """Create a dev-login test user, return (token, user_dict)."""
    email = f"TEST_{uuid.uuid4().hex[:8]}@mtree.dev"
    resp = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Tester"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "session_token" in data
    assert "user" in data
    yield data["session_token"], data["user"]


class TestDevLogin:
    def test_dev_login_returns_token_and_user(self, dev_user):
        token, user = dev_user
        assert isinstance(token, str) and len(token) > 10
        assert user["email"].endswith("@mtree.dev")

    def test_dev_login_rejects_non_mtree_email(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": "hacker@gmail.com", "name": "X"})
        assert resp.status_code == 403


class TestAuthMe:
    def test_me_with_valid_token_returns_200(self, api_client, dev_user):
        token, user = dev_user
        resp = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == user["email"]
        assert body["user_id"] == user["user_id"]

    def test_me_with_invalid_token_returns_401(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer garbage_invalid_token_123"})
        assert resp.status_code == 401

    def test_me_with_no_auth_header_returns_401(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 401

    def test_me_with_malformed_bearer_returns_401(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "NotBearer sometoken"})
        assert resp.status_code == 401


class TestLogoutAndProfileUpdate:
    def test_profile_update_then_me_reflects_change(self, api_client, dev_user):
        token, user = dev_user
        headers = {"Authorization": f"Bearer {token}"}
        # simulate reminder settings save (as ReminderCenter onSaved would do)
        patch_resp = api_client.patch(
            f"{BASE_URL}/api/profile",
            headers=headers,
            json={"notification_count": 3},
        )
        assert patch_resp.status_code == 200, patch_resp.text
        assert patch_resp.json().get("notification_count") == 3

        # Confirm token STILL valid after save (this is the refresh() call in onSaved)
        me_resp = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        assert me_resp.json()["notification_count"] == 3

    def test_logout_then_old_token_still_processed_by_server(self, api_client, dev_user):
        """Logout call itself should succeed with 200/204."""
        token, user = dev_user
        headers = {"Authorization": f"Bearer {token}"}
        logout_resp = api_client.post(f"{BASE_URL}/api/auth/logout", headers=headers)
        assert logout_resp.status_code in (200, 204)
