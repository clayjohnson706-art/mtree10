"""
Tests for the NEW features in this session:
1. Daily Streak Reminder profile fields (streak_reminder_enabled/streak_reminder_time via PATCH /api/profile)
2. Community Wall graphical detail view data (GET /api/community/wall returns fields needed:
   testimony, max_streak, streak_count, current_day, fasting_enabled, etc.)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/dev-login", params={"email": "test@mtree.dev", "name": "Test User"})
    if resp.status_code != 200:
        pytest.skip(f"dev-login failed: {resp.status_code} {resp.text}")
    token = resp.json().get("session_token") or resp.json().get("token")
    if token:
        session.headers.update({"Authorization": f"Bearer {token}"})
    else:
        # cookie-based session
        pass
    session.dev_login_body = resp.json()
    return session


class TestStreakReminderProfile:
    def test_me_has_streak_reminder_defaults(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert "streak_reminder_enabled" in data
        assert "streak_reminder_time" in data

    def test_patch_enable_streak_reminder(self, api_client):
        resp = api_client.patch(f"{BASE_URL}/api/profile", json={"streak_reminder_enabled": True, "streak_reminder_time": "07:30"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["streak_reminder_enabled"] is True
        assert data["streak_reminder_time"] == "07:30"

        # verify persisted via GET /api/auth/me
        me = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        me_data = me.json()
        assert me_data["streak_reminder_enabled"] is True
        assert me_data["streak_reminder_time"] == "07:30"

    def test_patch_change_time_only(self, api_client):
        resp = api_client.patch(f"{BASE_URL}/api/profile", json={"streak_reminder_time": "21:15"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["streak_reminder_time"] == "21:15"
        assert data["streak_reminder_enabled"] is True  # unchanged

    def test_patch_disable_streak_reminder(self, api_client):
        resp = api_client.patch(f"{BASE_URL}/api/profile", json={"streak_reminder_enabled": False})
        assert resp.status_code == 200
        data = resp.json()
        assert data["streak_reminder_enabled"] is False

        me = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me.json()["streak_reminder_enabled"] is False


class TestCommunityWallDetail:
    def test_wall_accessible_for_premium(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/community/wall")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_and_manifest_for_wall(self, api_client):
        # Abandon any existing active manifestation first
        active = api_client.get(f"{BASE_URL}/api/manifestations/active")
        if active.status_code == 200 and active.json():
            mid = active.json()["id"]
            api_client.post(f"{BASE_URL}/api/manifestations/{mid}/abandon")

        create_resp = api_client.post(f"{BASE_URL}/api/manifestations", json={
            "goal_category": "money",
            "sacrifice_category": "sugar",
            "cycle_days": 21,
            "deity_id": "lakshmi",
            "affirmation_enabled": False,
            "fasting_enabled": True,
            "hustle_enabled": False,
        })
        assert create_resp.status_code in (200, 201), create_resp.text
        m = create_resp.json()
        mid = m["id"]

        ritual_resp = api_client.post(f"{BASE_URL}/api/manifestations/{mid}/ritual", json={"local_date": "2026-01-15"})
        assert ritual_resp.status_code == 200, ritual_resp.text

        manifested_resp = api_client.post(f"{BASE_URL}/api/manifestations/{mid}/manifested", json={
            "testimony": "TEST_It finally happened, thank you!",
            "donation_amount": 0,
        })
        assert manifested_resp.status_code == 200, manifested_resp.text
        result = manifested_resp.json()
        assert result["status"] == "manifested"
        assert result["testimony"] == "TEST_It finally happened, thank you!"

        # Now verify it appears on wall with all fields needed for graphical detail view
        wall_resp = api_client.get(f"{BASE_URL}/api/community/wall")
        assert wall_resp.status_code == 200
        wall_items = wall_resp.json()
        match = next((w for w in wall_items if w["id"] == mid), None)
        assert match is not None, "Newly manifested post not found on wall (is_public may be False)"
        assert match["testimony"] == "TEST_It finally happened, thank you!"
        assert "max_streak" in match
        assert "streak_count" in match
        assert "current_day" in match
        assert "fasting_enabled" in match
        assert match["status"] == "manifested"
