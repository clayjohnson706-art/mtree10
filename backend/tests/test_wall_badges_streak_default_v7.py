"""
Tests for round-7 items:
- Item 9: Community Wall/leaderboard never show 'Test User' / @mtree.dev accounts; permanent
  guard forces is_public=false on manifestation creation for @mtree.dev accounts.
- Item 10: Brand new @mtree.dev user gets streak_reminder_enabled=True by default via
  GET /api/auth/me, and can still opt out (toggle off works).
- Item 7 (backend fields): manifestations expose donated / affirmation_enabled / hustle_enabled
  fields needed for the new wall badges.
"""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def test_user(api_client):
    """Existing seeded test@mtree.dev premium dev-login account."""
    resp = api_client.post(f"{BASE_URL}/api/auth/dev-login",
                            params={"email": "test@mtree.dev", "name": "Test User"})
    assert resp.status_code == 200
    token = resp.json()["session_token"]
    api_client.headers.update({"Authorization": f"Bearer {token}"})
    return api_client


@pytest.fixture
def fresh_user(api_client):
    """Brand new @mtree.dev user created fresh via dev-login for item 10's default check."""
    email = f"TEST_freshuser_{uuid.uuid4().hex[:8]}@mtree.dev"
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/dev-login",
                         params={"email": email, "name": "Fresh New User"})
    assert resp.status_code == 200
    token = resp.json()["session_token"]
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session, email


class TestItem10StreakReminderDefaultOn:
    def test_fresh_user_streak_reminder_default_true(self, fresh_user):
        session, email = fresh_user
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == email
        assert data["streak_reminder_enabled"] is True, \
            f"Expected default streak_reminder_enabled=True for brand new user, got {data.get('streak_reminder_enabled')}"

    def test_fresh_user_can_opt_out(self, fresh_user):
        session, email = fresh_user
        # Confirm default ON first
        me = session.get(f"{BASE_URL}/api/auth/me").json()
        assert me["streak_reminder_enabled"] is True

        # Toggle OFF via PATCH /api/profile
        patch_resp = session.patch(f"{BASE_URL}/api/profile", json={"streak_reminder_enabled": False})
        assert patch_resp.status_code == 200

        me_after = session.get(f"{BASE_URL}/api/auth/me").json()
        assert me_after["streak_reminder_enabled"] is False, "User must be able to opt out of streak reminder"


class TestItem9NoTestUserOnWall:
    def test_wall_excludes_test_user(self, test_user):
        resp = test_user.get(f"{BASE_URL}/api/community/wall")
        assert resp.status_code == 200
        items = resp.json()
        names = [i.get("user_name") for i in items]
        assert "Test User" not in names, f"'Test User' must never appear on the wall, got names={names}"
        for i in items:
            assert not (i.get("user_name") or "").strip().lower() == "test user"

    def test_leaderboard_excludes_test_user(self, test_user):
        resp = test_user.get(f"{BASE_URL}/api/community/leaderboard")
        assert resp.status_code == 200
        items = resp.json()
        names = [i.get("user_name") for i in items]
        assert "Test User" not in names, f"'Test User' must never appear on leaderboard, got names={names}"

    def test_new_manifestation_forced_private_for_mtree_dev(self, test_user):
        """Create + manifest a new manifestation as test@mtree.dev, verify is_public=False
        was forced server-side, and it never appears on the public wall."""
        # Abandon-safe create
        create_payload = {
            "goal_category": "money",
            "goal_custom": None,
            "sacrifice_category": "sugar",
            "sacrifice_custom": None,
            "cycle_days": 21,
            "fasting_enabled": False,
            "affirmation_enabled": True,
            "hustle_enabled": True,
            "reminder_count": 0,
            "is_public": True,  # client explicitly requests public — backend must override
        }
        create_resp = test_user.post(f"{BASE_URL}/api/manifestations", json=create_payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        assert created["is_public"] is False, \
            "Backend must force is_public=False for @mtree.dev accounts even if client requests True"
        mid = created["id"]

        manifest_resp = test_user.post(f"{BASE_URL}/api/manifestations/{mid}/manifested",
                                        json={"donation_amount": 0, "testimony": None})
        assert manifest_resp.status_code == 200

        wall_resp = test_user.get(f"{BASE_URL}/api/community/wall", params={"limit": 50})
        assert wall_resp.status_code == 200
        wall_ids = [i["id"] for i in wall_resp.json()]
        assert mid not in wall_ids, "Newly manifested @mtree.dev manifestation must NOT appear on wall"


class TestItem7WallBadgeFields:
    def test_wall_items_have_badge_fields(self, test_user):
        """Verify donated/affirmation_enabled/hustle_enabled fields present on wall items
        (consumed by frontend InfoBadge). Uses leaderboard since it includes all is_public
        items regardless of status."""
        resp = test_user.get(f"{BASE_URL}/api/community/leaderboard")
        assert resp.status_code == 200
        items = resp.json()
        if not items:
            pytest.skip("No public leaderboard items available to check badge fields on")
        for i in items:
            assert "donated" in i
            assert "affirmation_enabled" in i
            assert "hustle_enabled" in i
