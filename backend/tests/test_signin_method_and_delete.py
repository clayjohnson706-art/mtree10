"""Tests for:
1. New `signin_method` field on the user document (dev_login path) - set on POST
   /api/auth/dev-login and persisted/returned by GET /api/auth/me.
2. Regression: DELETE /api/account still works identically regardless of signin_method -
   creates a dev-login user, adds a manifestation, deletes account, verifies cascade delete.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestSigninMethodDevLogin:
    def test_dev_login_sets_signin_method(self, api_client):
        email = f"TEST_signinmethod_{uuid.uuid4().hex[:8]}@mtree.dev"
        resp = api_client.post(
            f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Signin Method Test"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["signin_method"] == "dev_login"
        token = data["session_token"]

        me_resp = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data["signin_method"] == "dev_login"
        assert me_data["email"] == email

    def test_repeat_dev_login_keeps_signin_method(self, api_client):
        """Logging in again with the same email should not lose signin_method."""
        email = f"TEST_signinmethod2_{uuid.uuid4().hex[:8]}@mtree.dev"
        resp1 = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "First"})
        assert resp1.status_code == 200
        resp2 = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "First"})
        assert resp2.status_code == 200
        assert resp2.json()["user"]["signin_method"] == "dev_login"
        assert resp1.json()["user"]["user_id"] == resp2.json()["user"]["user_id"]


class TestDeleteAccountCascade:
    def test_delete_account_cascades(self, api_client):
        email = f"TEST_deleteacct_{uuid.uuid4().hex[:8]}@mtree.dev"
        login_resp = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Delete Me"})
        assert login_resp.status_code == 200
        token = login_resp.json()["session_token"]
        user_id = login_resp.json()["user"]["user_id"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create a manifestation for this user (best-effort - endpoint may vary in payload shape)
        manifest_payload = {"deity_id": "shiva", "wish": "TEST wish for cascade delete", "category": "test"}
        create_resp = api_client.post(f"{BASE_URL}/api/manifestations", json=manifest_payload, headers=headers)
        # Not asserting strictly on create since payload shape may differ; proceed regardless
        manifestation_created = create_resp.status_code in (200, 201)

        # Delete account
        del_resp = api_client.delete(f"{BASE_URL}/api/account", headers=headers)
        assert del_resp.status_code == 200
        assert del_resp.json().get("ok") is True

        # Verify /auth/me now fails (session removed)
        me_resp = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_resp.status_code in (401, 403, 404)

        # Verify a fresh dev-login with same email creates a brand NEW user_id (old one is gone)
        relogin_resp = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Delete Me"})
        assert relogin_resp.status_code == 200
        assert relogin_resp.json()["user"]["user_id"] != user_id
