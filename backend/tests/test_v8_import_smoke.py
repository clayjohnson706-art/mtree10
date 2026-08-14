"""
Smoke tests for mtreev8 fresh import verification.
Covers: health check, dev-login, profile, manifestation create/ritual, subscribe stub,
tickets, notifications, community wall (non-admin endpoints only per review scope).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_BACKEND_URL', os.environ.get('EXPO_PUBLIC_BACKEND_URL', '')).rstrip('/')


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def dev_user(api_client):
    email = f"TEST_v8smoke_{uuid.uuid4().hex[:8]}@mtree.dev"
    r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Smoke Tester"})
    assert r.status_code == 200, r.text
    data = r.json()
    token = data["session_token"]
    yield {"token": token, "email": email, "user": data["user"]}


class TestHealth:
    def test_root_health(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"


class TestDevLogin:
    def test_dev_login_returns_token_and_user(self, dev_user):
        assert dev_user["token"].startswith("devtok_")
        assert dev_user["user"]["email"] == dev_user["email"]
        assert dev_user["user"]["is_premium"] is True

    def test_dev_login_rejects_non_mtree_dev_email(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": "hacker@gmail.com"})
        assert r.status_code == 403

    def test_auth_me(self, api_client, dev_user):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {dev_user['token']}"})
        assert r.status_code == 200
        assert r.json()["email"] == dev_user["email"]


class TestProfileAndManifestation:
    def test_profile_update_persists(self, api_client, dev_user):
        headers = {"Authorization": f"Bearer {dev_user['token']}"}
        r = api_client.patch(f"{BASE_URL}/api/profile", headers=headers, json={
            "name": "Smoke Tester Updated", "gender": "male", "dob": "1990-01-01",
            "onboarding_done": True, "profile_done": True, "deity_id": 1,
        })
        assert r.status_code == 200
        assert r.json()["name"] == "Smoke Tester Updated"
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers).json()
        assert me["profile_done"] is True
        assert me["deity_id"] == 1

    def test_create_manifestation_and_ritual(self, api_client, dev_user):
        headers = {"Authorization": f"Bearer {dev_user['token']}"}
        r = api_client.post(f"{BASE_URL}/api/manifestations", headers=headers, json={
            "goal_category": "wealth", "sacrifice_category": "smoking",
            "cycle_days": 21, "reminder_count": 0, "affirmation_enabled": False,
            "fasting_enabled": False, "hustle_enabled": False, "is_public": True,
        })
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["streak_count"] == 0
        mid = m["id"]

        active = api_client.get(f"{BASE_URL}/api/manifestations/active", headers=headers)
        assert active.status_code == 200
        assert active.json()["id"] == mid

        ritual = api_client.post(f"{BASE_URL}/api/manifestations/{mid}/ritual", headers=headers,
                                  json={"local_date": "2026-01-15"})
        assert ritual.status_code == 200, ritual.text
        rdata = ritual.json()
        assert rdata["manifestation"]["streak_count"] == 1

        # second ritual same day should fail
        ritual2 = api_client.post(f"{BASE_URL}/api/manifestations/{mid}/ritual", headers=headers,
                                   json={"local_date": "2026-01-15"})
        assert ritual2.status_code == 400


class TestSubscribeStub:
    def test_subscribe_grants_premium(self, api_client, dev_user):
        headers = {"Authorization": f"Bearer {dev_user['token']}"}
        r = api_client.post(f"{BASE_URL}/api/subscribe", headers=headers, json={"plan": "monthly"})
        assert r.status_code == 200
        assert r.json()["is_premium"] is True


class TestCommunityWall:
    def test_wall_loads_for_premium_user(self, api_client, dev_user):
        headers = {"Authorization": f"Bearer {dev_user['token']}"}
        r = api_client.get(f"{BASE_URL}/api/community/wall", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestTicketsAndNotifications:
    def test_create_and_list_ticket(self, api_client, dev_user):
        headers = {"Authorization": f"Bearer {dev_user['token']}"}
        r = api_client.post(f"{BASE_URL}/api/tickets", headers=headers, json={
            "subject": "TEST_ticket subject", "description": "TEST_ ticket description body",
        })
        assert r.status_code == 200
        tid = r.json()["id"]
        lst = api_client.get(f"{BASE_URL}/api/tickets", headers=headers)
        assert lst.status_code == 200
        assert any(t["id"] == tid for t in lst.json())

    def test_notifications_empty_state(self, api_client, dev_user):
        headers = {"Authorization": f"Bearer {dev_user['token']}"}
        r = api_client.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
