"""
Backend regression tests for the SUBSCRIPTIONS_ENABLED=false UI-hide change.
This change is UI-only (frontend), so these tests verify the backend contract the
frontend still relies on: is_premium remains true for users, /subscribe mock is
still technically reachable (though unreachable from UI nav), and onboarding_done
persists correctly to drive the post-onboarding redirect logic.
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


class TestSubscriptionStillFreeForAll:
    """is_premium must remain true for all users — this UI-hide change must not alter backend logic."""

    def test_fresh_user_dev_login_is_premium_true(self, api_client):
        email = f"TEST_subhide_{uuid.uuid4().hex[:8]}@mtree.dev"
        resp = api_client.post(f"{BASE_URL}/api/auth/dev-login?email={email}&name=Test%20SubHide")
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["is_premium"] is True
        assert data["user"]["onboarding_done"] is False

    def test_existing_premium_user_still_premium(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/dev-login?email=test@mtree.dev&name=Test%20User")
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["is_premium"] is True

    def test_onboarding_done_flag_persists_for_redirect_logic(self, api_client):
        email = f"TEST_subhide_onb_{uuid.uuid4().hex[:8]}@mtree.dev"
        resp = api_client.post(f"{BASE_URL}/api/auth/dev-login?email={email}&name=Test%20Onb")
        assert resp.status_code == 200
        token = resp.json()["session_token"]
        assert resp.json()["user"]["onboarding_done"] is False

        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        patch_resp = api_client.patch(f"{BASE_URL}/api/profile", json={"onboarding_done": True}, headers=headers)
        assert patch_resp.status_code == 200
        assert patch_resp.json()["onboarding_done"] is True

        me_resp = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        assert me_resp.json()["onboarding_done"] is True

    def test_subscribe_endpoint_still_technically_reachable_but_unused_by_ui(self, api_client):
        """Pre-existing mock endpoint — confirms backend unchanged, just unreachable from UI nav."""
        email = f"TEST_subhide_sub_{uuid.uuid4().hex[:8]}@mtree.dev"
        resp = api_client.post(f"{BASE_URL}/api/auth/dev-login?email={email}&name=Test%20Sub")
        token = resp.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        sub_resp = api_client.post(f"{BASE_URL}/api/subscribe", json={"plan": "monthly"}, headers=headers)
        # Just verify it doesn't 404/error — endpoint still exists server-side (unreachable from UI only)
        assert sub_resp.status_code in (200, 201)
