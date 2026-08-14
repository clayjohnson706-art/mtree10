"""
Regression tests for the DONATIONS_ENABLED=false feature flag (success.tsx).
Covers: dev-login -> create manifestation -> mark manifested with donation_amount=0
-> verify persistence (donated=False, donation_amount=0, testimony saved).
"""
import os
import pytest
import requests
from dotenv import dotenv_values

_frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or _frontend_env.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(
        f"{BASE_URL}/api/auth/dev-login",
        params={"email": "test@mtree.dev", "name": "Test User"},
    )
    assert resp.status_code == 200, f"dev-login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    token = data.get("token") or data.get("session_token") or data.get("access_token")
    if token:
        session.headers.update({"Authorization": f"Bearer {token}"})
    else:
        # cookie-based session
        pass
    return session


class TestManifestedWithZeroDonation:
    def test_create_and_manifest_with_zero_donation(self, api_client):
        # Ensure clean active manifestation
        create_resp = api_client.post(
            f"{BASE_URL}/api/manifestations",
            json={
                "deity_id": "ganesha",
                "goal_category": "custom",
                "goal_custom": "TEST_goal_donation_hide",
                "sacrifice_category": "custom",
                "sacrifice_custom": "TEST_sacrifice",
                "cycle_days": 21,
                "reminder_count": 0,
            },
        )
        assert create_resp.status_code == 200, create_resp.text
        m = create_resp.json()
        mid = m["id"]
        assert m["status"] == "active"
        assert m["donation_amount"] == 0

        # Directly finalize as "manifested" (simulating reaching success screen)
        manifested_resp = api_client.post(
            f"{BASE_URL}/api/manifestations/{mid}/manifested",
            json={"testimony": "TEST_testimony_zero_donation", "donation_amount": 0, "donation_currency": "INR"},
        )
        assert manifested_resp.status_code == 200, manifested_resp.text
        updated = manifested_resp.json()
        assert updated["status"] == "manifested"
        assert updated["donation_amount"] == 0
        assert updated["donated"] is False
        assert updated["testimony"] == "TEST_testimony_zero_donation"

        # GET active should now be None since it's manifested
        active_resp = api_client.get(f"{BASE_URL}/api/manifestations/active")
        assert active_resp.status_code == 200
        assert active_resp.json() is None

    def test_auth_me_sanity(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email") == "test@mtree.dev"
