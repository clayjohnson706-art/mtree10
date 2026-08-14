"""Iteration 4 backend regression tests — mtree spiritual manifestation.
Covers: dev-login, /auth/me, PATCH /profile (onboarding+deity), POST /manifestations,
GET /manifestations/active, admin /login."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mtree-ui-overhaul.preview.emergentagent.com").rstrip("/")
ADMIN_PASSWORD = "MTree@Sacred#2026"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def dev_token(api):
    email = f"TEST_iter4_{int(time.time())}@mtree.dev"
    r = api.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "IT4"})
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("session_token") or data.get("token")
    assert token
    return {"token": token, "email": email}


@pytest.fixture(scope="module")
def auth_headers(dev_token):
    return {"Authorization": f"Bearer {dev_token['token']}"}


class TestAuth:
    def test_auth_me(self, api, auth_headers, dev_token):
        r = api.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        user = body.get("user") or body
        assert user.get("email") == dev_token["email"]

    def test_invalid_token_rejected(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer nope"})
        assert r.status_code in (401, 403)


class TestProfileAndManifestation:
    def test_patch_profile_deity_and_onboarding(self, api, auth_headers):
        r = api.patch(
            f"{BASE_URL}/api/profile",
            headers=auth_headers,
            json={
                "onboarding_done": True,
                "profile_done": True,
                "tour_done": True,
                "journey_intro_seen": True,
                "deity_id": 6,
            },
        )
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("onboarding_done") is True
        assert u.get("deity_id") == 6

    def test_create_and_get_active_manifestation(self, api, auth_headers):
        payload = {
            "goal_category": "money",
            "burning_desire": "TEST_iter4 desire",
            "sacrifice_category": "social_media",
            "cycle_days": 21,
            "reminder_count": 5,
            "reminder_mode": "random",
            "affirmation_enabled": True,
            "is_public": True,
        }
        c = api.post(f"{BASE_URL}/api/manifestations", headers=auth_headers, json=payload)
        assert c.status_code in (200, 201), c.text
        created = c.json()
        assert created.get("burning_desire") == payload["burning_desire"]
        mid = created.get("id") or created.get("_id")
        assert mid

        g = api.get(f"{BASE_URL}/api/manifestations/active", headers=auth_headers)
        assert g.status_code == 200, g.text
        active = g.json()
        assert active is not None
        assert active.get("burning_desire") == payload["burning_desire"]
        assert active.get("goal_category") == "money"
        assert active.get("sacrifice_category") == "social_media"


class TestAdmin:
    def test_admin_login_password(self, api):
        r = api.post(f"{BASE_URL}/api/admin/login", json={"password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("access_token") or b.get("token")

    def test_admin_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/admin/login", json={"password": "WRONG"})
        assert r.status_code in (400, 401, 403)
