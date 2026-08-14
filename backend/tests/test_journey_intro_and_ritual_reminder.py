"""
Backend tests for NEW features this session:
1. journey_intro_seen flag lifecycle (dev-login -> PATCH /profile -> GET /auth/me)
2. /manifestations POST + /manifestations/active GET (used by ritual-reminder screen)
3. /affirmations/{category} GET (used by ritual-reminder screen when affirmation_enabled)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def dev_login(api_client, email, name="Tester"):
    r = api_client.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": name})
    assert r.status_code == 200, r.text
    return r.json()


class TestJourneyIntroFlag:
    def test_new_user_journey_intro_seen_false(self, api_client):
        email = f"TEST_journey_{uuid.uuid4().hex[:8]}@mtree.dev"
        data = dev_login(api_client, email)
        assert data["user"]["journey_intro_seen"] is False
        assert "session_token" in data

    def test_patch_journey_intro_seen_true_persists(self, api_client):
        email = f"TEST_journey_{uuid.uuid4().hex[:8]}@mtree.dev"
        data = dev_login(api_client, email)
        token = data["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # confirm false initially
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["journey_intro_seen"] is False

        # patch to true (simulating journey-intro.tsx finish())
        patch = api_client.patch(f"{BASE_URL}/api/profile", json={"journey_intro_seen": True}, headers=headers)
        assert patch.status_code == 200
        assert patch.json()["journey_intro_seen"] is True

        # verify persisted via fresh GET
        me2 = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me2.status_code == 200
        assert me2.json()["journey_intro_seen"] is True

    def test_dev_login_repeat_returns_same_user_with_flag_intact(self, api_client):
        email = f"TEST_journey_{uuid.uuid4().hex[:8]}@mtree.dev"
        data1 = dev_login(api_client, email)
        token1 = data1["session_token"]
        headers = {"Authorization": f"Bearer {token1}"}
        api_client.patch(f"{BASE_URL}/api/profile", json={"journey_intro_seen": True}, headers=headers)

        # dev-login again with same email -> should fetch same user, flag should remain True
        data2 = dev_login(api_client, email)
        assert data2["user"]["journey_intro_seen"] is True
        assert data2["user"]["user_id"] == data1["user"]["user_id"]


class TestManifestationsAndRitualReminderData:
    def test_create_manifestation_then_active_reflects_it(self, api_client):
        email = f"TEST_manifest_{uuid.uuid4().hex[:8]}@mtree.dev"
        data = dev_login(api_client, email)
        token = data["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "goal_category": "wealth",
            "goal_custom": None,
            "goal_description": None,
            "sacrifice_category": "sugar",
            "sacrifice_custom": None,
            "sacrifice_description": None,
            "cycle_days": 21,
            "reminder_count": 0,
            "reminder_mode": "random",
            "reminder_times": [],
            "affirmation_enabled": True,
            "fasting_enabled": False,
            "hustle_enabled": False,
            "is_public": True,
            "cosmic_level_at_start": 50,
            "moon_phase_at_start": "Full Moon",
        }
        create = api_client.post(f"{BASE_URL}/api/manifestations", json=payload, headers=headers)
        assert create.status_code in (200, 201), create.text

        active = api_client.get(f"{BASE_URL}/api/manifestations/active", headers=headers)
        assert active.status_code == 200
        active_data = active.json()
        assert active_data is not None
        assert active_data["goal_category"] == "wealth"
        assert active_data["sacrifice_category"] == "sugar"
        assert active_data["affirmation_enabled"] is True

    def test_active_manifestation_null_for_user_with_none(self, api_client):
        email = f"TEST_noactive_{uuid.uuid4().hex[:8]}@mtree.dev"
        data = dev_login(api_client, email)
        token = data["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        active = api_client.get(f"{BASE_URL}/api/manifestations/active", headers=headers)
        assert active.status_code == 200
        assert active.json() is None

    def test_affirmation_endpoint_returns_text(self, api_client):
        r = requests.get(f"{BASE_URL}/api/affirmations/wealth", params={"language": "english"})
        assert r.status_code == 200
        data = r.json()
        assert "text" in data
        assert isinstance(data["text"], str) and len(data["text"]) > 0
