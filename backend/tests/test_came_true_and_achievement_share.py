"""
Backend tests for: "Came True" flow + Achievement Share feature (backend side).
Covers: dev-login, manifestation creation, ritual completion, and the
POST /manifestations/{id}/manifested endpoint (donation + skip-donation paths),
which underpins the success.tsx donation/share screen tested on the frontend.
"""
import os
import uuid
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if not url:
        env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                        url = line.strip().split("=", 1)[1]
                        break
    return (url or "").rstrip("/")


BASE_URL = _load_backend_url()


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def dev_user(api_client):
    """Creates a fresh dev-login user and returns (session, token, user)."""
    email = f"TEST_camesuretrue_{uuid.uuid4().hex[:8]}@mtree.dev"
    resp = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Tester"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    token = data["session_token"]
    api_client.headers.update({"Authorization": f"Bearer {token}"})
    yield api_client, data["user"]
    # cleanup: delete account
    try:
        api_client.delete(f"{BASE_URL}/api/account")
    except Exception:
        pass


class TestDevLogin:
    def test_dev_login_new_user_is_premium(self, api_client):
        email = f"TEST_devlogin_{uuid.uuid4().hex[:8]}@mtree.dev"
        resp = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Tester"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "session_token" in data
        assert data["user"]["email"] == email
        assert data["user"]["is_premium"] is True

    def test_dev_login_rejects_non_mtree_email(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": "someone@gmail.com", "name": "X"})
        assert resp.status_code == 403


class TestManifestationCameTrueFlow:
    def _create_manifestation(self, session):
        payload = {
            "goal_category": "wealth",
            "sacrifice_category": "sugar",
            "deity_id": "ganesha",
            "cycle_days": 21,
            "reminder_count": 0,
            "affirmation_enabled": False,
            "fasting_enabled": False,
            "hustle_enabled": False,
        }
        resp = session.post(f"{BASE_URL}/api/manifestations", json=payload)
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_create_and_get_active(self, dev_user):
        session, user = dev_user
        m = self._create_manifestation(session)
        assert m["status"] == "active"
        assert m["goal_category"] == "wealth"
        mid = m["id"]

        active = session.get(f"{BASE_URL}/api/manifestations/active").json()
        assert active["id"] == mid

    def test_ritual_then_manifested_with_donation(self, dev_user):
        session, user = dev_user
        m = self._create_manifestation(session)
        mid = m["id"]

        # perform ritual
        ritual_resp = session.post(f"{BASE_URL}/api/manifestations/{mid}/ritual", json={"local_date": "2026-01-15"})
        assert ritual_resp.status_code == 200, ritual_resp.text
        ritual_data = ritual_resp.json()
        assert ritual_data["manifestation"]["current_day"] == 1
        assert ritual_data["manifestation"]["streak_count"] == 1

        # duplicate ritual same day should fail
        dup_resp = session.post(f"{BASE_URL}/api/manifestations/{mid}/ritual", json={"local_date": "2026-01-15"})
        assert dup_resp.status_code == 400

        # mark manifested with donation
        manifested_resp = session.post(
            f"{BASE_URL}/api/manifestations/{mid}/manifested",
            json={"testimony": "TEST_ It really worked!", "donation_amount": 501, "donation_currency": "INR"},
        )
        assert manifested_resp.status_code == 200, manifested_resp.text
        result = manifested_resp.json()
        assert result["status"] == "manifested"
        assert result["donated"] is True
        assert result["donation_amount"] == 501
        assert result["testimony"] == "TEST_ It really worked!"

        # verify no longer active
        active = session.get(f"{BASE_URL}/api/manifestations/active").json()
        assert active is None

    def test_manifested_skip_donation(self, dev_user):
        session, user = dev_user
        m = self._create_manifestation(session)
        mid = m["id"]

        manifested_resp = session.post(
            f"{BASE_URL}/api/manifestations/{mid}/manifested",
            json={"testimony": None, "donation_amount": 0, "donation_currency": "INR"},
        )
        assert manifested_resp.status_code == 200, manifested_resp.text
        result = manifested_resp.json()
        assert result["status"] == "manifested"
        assert result["donated"] is False
        assert result["donation_amount"] == 0

    def test_manifested_nonexistent_id_returns_404(self, dev_user):
        session, user = dev_user
        resp = session.post(
            f"{BASE_URL}/api/manifestations/does-not-exist/manifested",
            json={"testimony": None, "donation_amount": 0, "donation_currency": "INR"},
        )
        assert resp.status_code == 404
