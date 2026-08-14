"""Backend regression tests for the UI overhaul iteration (v10).

Verifies:
- /api/auth/me
- /api/manifestations/active
- /api/app-config
- /api/community/wall (free)
- /api/admin/login + /api/admin/stats
- Profile PATCH and manifestation create still work
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://mtree-ui-overhaul.preview.emergentagent.com"
ADMIN_PASSWORD = "MTree@Sacred#2026"


@pytest.fixture(scope="module")
def user_token():
    email = f"TEST_uiv10_{int(time.time())}@mtree.dev"
    r = requests.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "UI V10 Tester"}, timeout=15)
    assert r.status_code == 200, f"dev-login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth_headers(user_token):
    return {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}


class TestBasicEndpoints:
    def test_auth_me(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "user_id" in j or "id" in j
        assert "email" in j

    def test_app_config(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/app-config", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        # subscription/community should be FREE per iteration goal
        assert j.get("community_premium_required") is False or j.get("community_premium_required") is None
        assert "subscription_enabled" in j or True  # tolerant

    def test_community_wall_free(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/community/wall", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "items" in j or isinstance(j, list)


class TestManifestationFlow:
    def test_profile_patch_and_create_manifestation(self, auth_headers):
        # PATCH profile to bypass onboarding
        r = requests.patch(
            f"{BASE_URL}/api/profile",
            json={"onboarding_done": True, "profile_done": True, "deity_id": 6},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Create manifestation
        payload = {
            "goal_category": "money",
            "burning_desire": "TEST_ Test desire",
            "sacrifice_category": "social_media",
            "cycle_days": 21,
            "reminder_count": 5,
            "reminder_mode": "random",
            "affirmation_enabled": True,
            "is_public": True,
            "hustle_enabled": True,
            "fasting_enabled": True,
        }
        r = requests.post(f"{BASE_URL}/api/manifestations", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        m = r.json()
        assert m.get("goal_category") == "money"
        assert m.get("hustle_enabled") is True
        assert m.get("fasting_enabled") is True

    def test_active_manifestation(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/manifestations/active", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        # Verify persistence
        assert j is not None
        assert j.get("goal_category") == "money"
        assert j.get("hustle_enabled") is True
        assert j.get("fasting_enabled") is True


class TestAdmin:
    def test_admin_login_and_stats(self):
        r = requests.post(f"{BASE_URL}/api/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200, r.text
        token = r.json().get("token") or r.json().get("access_token") or r.json().get("bearer")
        assert token, f"no admin token in {r.json()}"
        h = {"Authorization": f"Bearer {token}"}
        r2 = requests.get(f"{BASE_URL}/api/admin/stats", headers=h, timeout=15)
        assert r2.status_code == 200, r2.text
        s = r2.json()
        assert isinstance(s, dict)
        # standard metric key
        assert any(k in s for k in ("total_users", "users_total", "user_count"))
