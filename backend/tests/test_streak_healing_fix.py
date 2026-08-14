"""
Tests for the 'Best 0' / max_streak healing bug fix.
Covers: dev-login, manifestation creation, ritual (hold-to-manifest) flow,
max_streak >= streak_count invariant, and spot-checks on leaderboard/saved/garden/wall
endpoints (they must not error and any manifestation returned must respect the invariant).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    resp = s.post(f"{API}/auth/dev-login", params={"email": "test@mtree.dev", "name": "Test User"})
    assert resp.status_code == 200, f"dev-login failed: {resp.text}"
    data = resp.json()
    token = data.get("session_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


class TestMaxStreakHealing:
    def test_dev_login_and_me(self, session):
        me = session.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json().get("email") == "test@mtree.dev"

    def test_get_or_create_active_manifestation(self, session):
        active = session.get(f"{API}/manifestations/active")
        assert active.status_code == 200
        m = active.json()
        if m is None:
            payload = {
                "goal_category": "money",
                "sacrifice_category": "sugar",
                "cycle_days": 21,
                "affirmation_enabled": True,
                "reminder_count": 0,
                "fasting_enabled": False,
                "hustle_enabled": False,
                "is_public": True,
            }
            create = session.post(f"{API}/manifestations", json=payload)
            assert create.status_code == 200, create.text
            m = create.json()
        assert m is not None
        assert m["max_streak"] >= m["streak_count"]
        # Persist manifestation id for subsequent tests via class attribute
        TestMaxStreakHealing.mid = m["id"]

    def test_perform_ritual_and_verify_streak_sync(self, session):
        mid = TestMaxStreakHealing.mid
        from datetime import datetime
        local_date = datetime.now().strftime("%Y-%m-%d")
        resp = session.post(f"{API}/manifestations/{mid}/ritual", json={"local_date": local_date})
        # It's OK if already performed today (400) - then just verify active state
        if resp.status_code == 400:
            assert "Already performed" in resp.text
        else:
            assert resp.status_code == 200, resp.text
            m = resp.json()["manifestation"]
            assert m["streak_count"] >= 1
            assert m["max_streak"] >= m["streak_count"]

        # GET active to verify persistence
        active = session.get(f"{API}/manifestations/active")
        assert active.status_code == 200
        m2 = active.json()
        assert m2 is not None
        assert m2["max_streak"] >= m2["streak_count"], "max_streak must never be less than streak_count"

    def test_leaderboard_does_not_error_and_respects_invariant(self, session):
        resp = session.get(f"{API}/community/leaderboard")
        # 403 if not premium - acceptable, just don't 500
        assert resp.status_code in (200, 403), resp.text
        if resp.status_code == 200:
            for m in resp.json():
                assert m["max_streak"] >= m["streak_count"], f"Invariant broken for {m.get('id')}"

    def test_saved_does_not_error_and_respects_invariant(self, session):
        resp = session.get(f"{API}/community/saved")
        assert resp.status_code in (200, 403), resp.text
        if resp.status_code == 200:
            for m in resp.json():
                assert m["max_streak"] >= m["streak_count"]

    def test_garden_does_not_error_and_respects_invariant(self, session):
        resp = session.get(f"{API}/garden")
        assert resp.status_code == 200, resp.text
        for entry in resp.json():
            m = entry.get("manifestation")
            if m:
                assert m["max_streak"] >= m["streak_count"]

    def test_wall_does_not_error(self, session):
        resp = session.get(f"{API}/community/wall", params={"limit": 20})
        assert resp.status_code in (200, 403), resp.text
        if resp.status_code == 200:
            for m in resp.json():
                assert m["max_streak"] >= m["streak_count"]
