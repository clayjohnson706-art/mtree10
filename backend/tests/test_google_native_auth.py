"""Tests for the new native Google Sign-In backend endpoint (POST /api/auth/google)
and regression check for the existing dev-login flow. Real Google OAuth completion
cannot be tested here (no real device/account) - only the invalid-token rejection path.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestGoogleNativeAuthEndpoint:
    def test_invalid_id_token_returns_401(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/google", json={"id_token": "garbage-not-a-real-jwt"})
        assert resp.status_code == 401
        data = resp.json()
        assert "detail" in data
        assert "invalid google id token" in data["detail"].lower()

    def test_missing_id_token_field_returns_422(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/google", json={})
        assert resp.status_code == 422

    def test_empty_string_id_token_returns_401(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/google", json={"id_token": ""})
        assert resp.status_code == 401


class TestDevLoginRegression:
    """Regression: dev-login flow must be unaffected by the new google auth endpoint."""

    def test_dev_login_still_works(self, api_client):
        resp = api_client.post(
            f"{BASE_URL}/api/auth/dev-login",
            params={"email": "TEST_google_regression@mtree.dev", "name": "Test Google Regression"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "session_token" in data
        assert data["user"]["email"] == "TEST_google_regression@mtree.dev"

        # Verify /auth/me works with the returned token
        token = data["session_token"]
        me_resp = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        assert me_resp.json()["user_id"] == data["user"]["user_id"]

        # Cleanup handled by conftest.py session teardown (mtree.dev auto-purge)
