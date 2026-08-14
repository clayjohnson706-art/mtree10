"""
mTree - Community Wall filters/rotation + hold-to-manifest local_date tests.
Covers: GET /api/community/wall (default limit, goal/sacrifice/cycle/fasting
filters, limit clamp to 50, fair-rotation via last_shown_at) and
POST /api/manifestations/{id}/ritual local_date behavior (iteration-7).
"""
import os
import uuid
import time
import pytest
import requests
from pathlib import Path


def _load_base_url() -> str:
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"
RUN_TAG = uuid.uuid4().hex[:8]


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _new_premium_user(session, tag):
    email = f"TEST_wall_{tag}_{RUN_TAG}@mtree.dev"
    r = session.post(f"{API}/auth/dev-login", params={"email": email, "name": "Wall U"})
    assert r.status_code == 200
    tok = r.json()["session_token"]
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    r_sub = session.post(f"{API}/subscribe", json={"plan": "monthly"}, headers=h)
    assert r_sub.status_code == 200
    return h


def _create_manifested(session, headers, goal="money", sacrifice="sugar",
                        cycle=21, fasting=False, testimony="TEST wall item"):
    payload = {
        "goal_category": goal,
        "goal_description": "TEST goal",
        "sacrifice_category": sacrifice,
        "sacrifice_description": "TEST sacrifice",
        "cycle_days": cycle,
        "reminder_count": 0,
        "affirmation_enabled": False,
        "fasting_enabled": fasting,
        "is_public": True,
    }
    r = session.post(f"{API}/manifestations", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    r2 = session.post(f"{API}/manifestations/{mid}/manifested",
                       json={"testimony": testimony, "donation_amount": 0},
                       headers=headers)
    assert r2.status_code == 200, r2.text
    return mid


class TestWallDefaultsAndFilters:
    def test_default_limit_is_20(self, session):
        h = _new_premium_user(session, "default")
        # seed 25 manifested items so default limit is actually testable
        for i in range(25):
            _create_manifested(session, h, goal="money", sacrifice="sugar", cycle=21)
        r = session.get(f"{API}/community/wall", headers=h)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) == 20, f"default limit should return 20 items, got {len(items)}"

    def test_only_manifested_status_returned(self, session):
        h = _new_premium_user(session, "statuscheck")
        mid_manifested = _create_manifested(session, h)
        # create an active one (never call /manifested)
        payload = {
            "goal_category": "money", "goal_description": "TEST active",
            "sacrifice_category": "sugar", "sacrifice_description": "TEST",
            "cycle_days": 21, "reminder_count": 0, "affirmation_enabled": False,
            "fasting_enabled": False, "is_public": True,
        }
        r_active = session.post(f"{API}/manifestations", json=payload, headers=h)
        active_id = r_active.json()["id"]

        r = session.get(f"{API}/community/wall", headers=h, params={"limit": 50})
        items = r.json()
        statuses = {x["status"] for x in items}
        assert statuses <= {"manifested"}, f"non-manifested status leaked: {statuses}"
        ids = {x["id"] for x in items}
        assert active_id not in ids

    def test_goal_category_filter(self, session):
        h = _new_premium_user(session, "goalfilter")
        target_id = _create_manifested(session, h, goal="health", sacrifice="sugar")
        _create_manifested(session, h, goal="career", sacrifice="sugar")
        r = session.get(f"{API}/community/wall", headers=h,
                         params={"goal_category": "health", "limit": 50})
        assert r.status_code == 200
        items = r.json()
        assert all(x["goal_category"] == "health" for x in items)
        assert any(x["id"] == target_id for x in items)

    def test_sacrifice_category_filter(self, session):
        h = _new_premium_user(session, "sacfilter")
        target_id = _create_manifested(session, h, goal="money", sacrifice="junk_food")
        r = session.get(f"{API}/community/wall", headers=h,
                         params={"sacrifice_category": "junk_food", "limit": 50})
        items = r.json()
        assert all(x["sacrifice_category"] == "junk_food" for x in items)
        assert any(x["id"] == target_id for x in items)

    def test_cycle_days_filter(self, session):
        h = _new_premium_user(session, "cyclefilter")
        target_id = _create_manifested(session, h, cycle=40)
        r = session.get(f"{API}/community/wall", headers=h,
                         params={"cycle_days": 40, "limit": 50})
        items = r.json()
        assert all(x["cycle_days"] == 40 for x in items)
        assert any(x["id"] == target_id for x in items)

    def test_fasting_enabled_filter(self, session):
        h = _new_premium_user(session, "fastfilter")
        target_id = _create_manifested(session, h, fasting=True)
        r = session.get(f"{API}/community/wall", headers=h,
                         params={"fasting_enabled": "true", "limit": 50})
        items = r.json()
        assert all(x["fasting_enabled"] is True for x in items)
        assert any(x["id"] == target_id for x in items)

    @pytest.mark.parametrize("limit,expected", [(10, 10), (20, 20), (50, 50)])
    def test_limit_param_values(self, session, limit, expected):
        h = _new_premium_user(session, f"limit{limit}")
        for _ in range(expected + 5):
            _create_manifested(session, h)
        r = session.get(f"{API}/community/wall", headers=h, params={"limit": limit})
        assert r.status_code == 200
        assert len(r.json()) == expected

    def test_limit_clamped_above_50(self, session):
        h = _new_premium_user(session, "clamphigh")
        for _ in range(55):
            _create_manifested(session, h)
        r = session.get(f"{API}/community/wall", headers=h, params={"limit": 999})
        assert r.status_code == 200
        assert len(r.json()) == 50, f"limit above 50 should clamp to 50, got {len(r.json())}"

    def test_limit_clamped_below_1(self, session):
        h = _new_premium_user(session, "clamplow")
        _create_manifested(session, h)
        r = session.get(f"{API}/community/wall", headers=h, params={"limit": 0})
        assert r.status_code == 200
        assert len(r.json()) == 1, f"limit<1 should clamp to 1, got {len(r.json())}"


class TestWallFairRotation:
    def test_last_shown_at_updates_after_fetch(self, session):
        h = _new_premium_user(session, "rotation1")
        mid = _create_manifested(session, h)
        # first fetch should include it (never shown -> sorts first)
        r1 = session.get(f"{API}/community/wall", headers=h, params={"limit": 50})
        ids1 = {x["id"] for x in r1.json()}
        assert mid in ids1, "freshly-manifested item should appear on first wall fetch"

        # create a second fresh item AFTER first fetch; it has no last_shown_at yet,
        # so it must rank before the just-shown item on the next fetch (limit=1)
        mid2 = _create_manifested(session, h)
        r2 = session.get(f"{API}/community/wall", headers=h, params={"limit": 1})
        top_ids = [x["id"] for x in r2.json()]
        assert mid2 in top_ids, (
            "never-shown item should be prioritized over a recently-shown one "
            f"(got {top_ids}, expected to contain {mid2})"
        )

    def test_shown_item_deprioritized_on_next_call(self, session):
        h = _new_premium_user(session, "rotation2")
        mid_a = _create_manifested(session, h)
        # show mid_a via limit=1 fetch (marks its last_shown_at = now)
        r1 = session.get(f"{API}/community/wall", headers=h, params={"limit": 1})
        assert r1.json()[0]["id"] == mid_a

        mid_b = _create_manifested(session, h)  # never shown
        r2 = session.get(f"{API}/community/wall", headers=h, params={"limit": 1})
        assert r2.json()[0]["id"] == mid_b, (
            "never-shown mid_b should be returned before recently-shown mid_a"
        )


class TestRitualLocalDate:
    def _create_active(self, session, headers):
        payload = {
            "goal_category": "money", "goal_description": "TEST ritual",
            "sacrifice_category": "sugar", "sacrifice_description": "TEST",
            "cycle_days": 21, "reminder_count": 0, "affirmation_enabled": False,
            "fasting_enabled": False, "is_public": True,
        }
        r = session.post(f"{API}/manifestations", json=payload, headers=headers)
        assert r.status_code == 200
        return r.json()["id"]

    def test_ritual_with_local_date_increments(self, session):
        h = _new_premium_user(session, "ritual1")
        mid = self._create_active(session, h)
        r = session.post(f"{API}/manifestations/{mid}/ritual", headers=h,
                          json={"local_date": "2026-01-10"})
        assert r.status_code == 200, r.text
        m = r.json()["manifestation"]
        assert m["current_day"] == 1
        assert m["streak_count"] == 1

    def test_same_local_date_twice_returns_400(self, session):
        h = _new_premium_user(session, "ritual2")
        mid = self._create_active(session, h)
        r1 = session.post(f"{API}/manifestations/{mid}/ritual", headers=h,
                           json={"local_date": "2026-01-10"})
        assert r1.status_code == 200
        r2 = session.post(f"{API}/manifestations/{mid}/ritual", headers=h,
                           json={"local_date": "2026-01-10"})
        assert r2.status_code == 400
        assert "Already performed today" in r2.text

    def test_different_local_date_next_day_succeeds_even_if_utc_unchanged(self, session):
        """This is the key bug fix under test: two ritual calls with different
        local_date values must both succeed (streak increments) EVEN THOUGH
        both calls happen within the same server UTC calendar day."""
        h = _new_premium_user(session, "ritual3")
        mid = self._create_active(session, h)
        r1 = session.post(f"{API}/manifestations/{mid}/ritual", headers=h,
                           json={"local_date": "2026-01-10"})
        assert r1.status_code == 200
        assert r1.json()["manifestation"]["current_day"] == 1

        # different local_date, same server UTC "today" -> must succeed
        r2 = session.post(f"{API}/manifestations/{mid}/ritual", headers=h,
                           json={"local_date": "2026-01-11"})
        assert r2.status_code == 200, (
            f"Expected day-2 ritual with different local_date to succeed, got "
            f"{r2.status_code}: {r2.text}"
        )
        m2 = r2.json()["manifestation"]
        assert m2["current_day"] == 2
        assert m2["streak_count"] == 2

    def test_ritual_without_local_date_falls_back_to_utc(self, session):
        h = _new_premium_user(session, "ritual4")
        mid = self._create_active(session, h)
        r1 = session.post(f"{API}/manifestations/{mid}/ritual", headers=h, json={})
        assert r1.status_code == 200
        r2 = session.post(f"{API}/manifestations/{mid}/ritual", headers=h, json={})
        assert r2.status_code == 400
        assert "Already performed today" in r2.text
