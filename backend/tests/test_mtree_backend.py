"""
mTree Backend end-to-end tests.
Covers auth, profile, deities, chandra-dasa, affirmations, subscribe,
manifestations lifecycle, garden, and premium-gated community endpoints.
"""

import os
import uuid
import pytest
import requests
from pathlib import Path

# Load EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env
def _load_base_url() -> str:
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")

BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

# Use unique email per full test run to avoid interference w/ prior runs
RUN_TAG = uuid.uuid4().hex[:8]
TEST_EMAIL = f"TEST_mtree_{RUN_TAG}@mtree.dev"
TEST_NAME = "TEST mTree Bot"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth(session):
    """Login once and get session_token; also returns user."""
    r = session.post(f"{API}/auth/dev-login",
                     params={"email": TEST_EMAIL, "name": TEST_NAME})
    assert r.status_code == 200, f"dev-login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data and "user" in data
    assert data["user"]["email"] == TEST_EMAIL
    return data


@pytest.fixture(scope="module")
def headers(auth):
    return {"Authorization": f"Bearer {auth['session_token']}",
            "Content-Type": "application/json"}


def _no_mongo_id(obj):
    """Recursively assert no `_id` keys present."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"Found _id in: {list(obj.keys())}"
        for v in obj.values():
            _no_mongo_id(v)
    elif isinstance(obj, list):
        for item in obj:
            _no_mongo_id(item)


# ---------------- Auth ----------------
class TestAuth:
    def test_dev_login_idempotent_same_email(self, session, auth):
        r = session.post(f"{API}/auth/dev-login",
                         params={"email": TEST_EMAIL, "name": TEST_NAME})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["user_id"] == auth["user"]["user_id"]

    def test_me_valid_token(self, session, headers, auth):
        r = session.get(f"{API}/auth/me", headers=headers)
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == TEST_EMAIL
        assert me["user_id"] == auth["user"]["user_id"]
        _no_mongo_id(me)

    def test_me_missing_auth_returns_401(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token_returns_401(self, session):
        r = session.get(f"{API}/auth/me",
                        headers={"Authorization": "Bearer invalid_xxx"})
        assert r.status_code == 401


# ---------------- Profile ----------------
class TestProfile:
    def test_patch_profile_updates_fields(self, session, headers):
        payload = {
            "name": "Updated mTree Bot",
            "gender": "other",
            "dob": "1990-01-01",
            "deity_id": 3,
            "is_public": True,
            "affirmation_language": "hindi",
            "onboarding_done": True,
            "profile_done": True,
        }
        r = session.patch(f"{API}/profile", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        u = r.json()
        _no_mongo_id(u)
        for k, v in payload.items():
            assert u[k] == v, f"{k} was not persisted: {u.get(k)} vs {v}"

        # verify persisted via GET /auth/me
        r2 = session.get(f"{API}/auth/me", headers=headers)
        me = r2.json()
        assert me["deity_id"] == 3
        assert me["affirmation_language"] == "hindi"
        assert me["onboarding_done"] is True

    def test_patch_profile_busy_hours(self, session, headers):
        """Iteration-3: notification_count + busy_start/end must persist."""
        payload = {
            "notification_count": 3,
            "notification_busy_start": "22:00",
            "notification_busy_end": "07:00",
        }
        r = session.patch(f"{API}/profile", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        u = r.json()
        _no_mongo_id(u)
        assert u["notification_count"] == 3
        assert u["notification_busy_start"] == "22:00"
        assert u["notification_busy_end"] == "07:00"

        # verify persisted via GET /auth/me
        me = session.get(f"{API}/auth/me", headers=headers).json()
        assert me["notification_count"] == 3
        assert me["notification_busy_start"] == "22:00"
        assert me["notification_busy_end"] == "07:00"


# ---------------- Static data ----------------
class TestStaticData:
    def test_deities_returns_seven(self, session):
        r = session.get(f"{API}/deities")
        assert r.status_code == 200
        deities = r.json()
        assert len(deities) == 7
        names = {d["name"] for d in deities}
        assert names == {"Zorath", "Kaelis", "Tharun", "Vynel", "Aethis",
                         "Solmara", "Luneth"}
        for d in deities:
            assert "color_hex" in d and d["color_hex"].startswith("#")
            assert "glow_hex" in d and d["glow_hex"].startswith("#")

    def test_chandra_dasa_today(self, session):
        r = session.get(f"{API}/chandra-dasa/today")
        assert r.status_code == 200
        d = r.json()
        assert 1 <= d["day_number"] <= 30
        assert "name" in d

    @pytest.mark.parametrize("cat", [
        "money", "health", "relationship", "career", "education",
        "family", "spiritual", "travel", "creativity", "fame",
        "peace", "confidence", "custom",
    ])
    def test_affirmations_all_categories(self, session, cat):
        r = session.get(f"{API}/affirmations/{cat}")
        assert r.status_code == 200
        a = r.json()
        assert a["text_english"]
        assert a["goal_category"] == cat

    def test_affirmation_unknown_falls_back_to_custom(self, session):
        r = session.get(f"{API}/affirmations/nonexistent_xyz")
        assert r.status_code == 200
        a = r.json()
        assert a["goal_category"] == "custom"
        assert a["text_english"]


# ---------------- Manifestations lifecycle ----------------
class TestManifestations:
    def _create_payload(self):
        return {
            "goal_category": "money",
            "goal_description": "TEST goal",
            "sacrifice_category": "sugar",
            "sacrifice_description": "TEST sacrifice",
            "cycle_days": 21,
            "reminder_count": 3,
            "affirmation_enabled": True,
            "fasting_enabled": False,
            "is_public": True,
        }

    def test_create_manifestation(self, session, headers, auth):
        r = session.post(f"{API}/manifestations",
                         json=self._create_payload(), headers=headers)
        assert r.status_code == 200, r.text
        m = r.json()
        _no_mongo_id(m)
        assert m["status"] == "active"
        assert m["current_day"] == 0
        assert m["tree_stage"] == 1
        assert m["cycle_days"] == 21
        assert m["user_id"] == auth["user"]["user_id"]
        # user_name and deity_id should be attached; deity_id set to 3 in profile test
        assert m["user_name"] is not None
        pytest.mtree_mid = m["id"]

    def test_creating_new_abandons_previous(self, session, headers):
        # Save previous id
        prev_id = getattr(pytest, "mtree_mid", None)
        r = session.post(f"{API}/manifestations",
                         json=self._create_payload(), headers=headers)
        assert r.status_code == 200
        new_m = r.json()
        assert new_m["id"] != prev_id
        assert new_m["status"] == "active"
        pytest.mtree_mid = new_m["id"]

        # verify previous marked abandoned
        r_active = session.get(f"{API}/manifestations/active", headers=headers)
        assert r_active.status_code == 200
        active = r_active.json()
        assert active is not None and active["id"] == new_m["id"]

    def test_active_returns_current(self, session, headers):
        r = session.get(f"{API}/manifestations/active", headers=headers)
        assert r.status_code == 200
        a = r.json()
        assert a is not None
        assert a["id"] == pytest.mtree_mid
        _no_mongo_id(a)

    def test_ritual_increments_day(self, session, headers):
        mid = pytest.mtree_mid
        r = session.post(f"{API}/manifestations/{mid}/ritual", headers=headers)
        assert r.status_code == 200, r.text
        payload = r.json()
        _no_mongo_id(payload)
        m = payload["manifestation"]
        assert m["current_day"] == 1
        assert m["streak_count"] == 1
        assert m["last_ritual_at"] is not None

    def test_ritual_twice_same_day_returns_400(self, session, headers):
        mid = pytest.mtree_mid
        r = session.post(f"{API}/manifestations/{mid}/ritual", headers=headers)
        assert r.status_code == 400
        assert "Already performed today" in r.text

    def test_mark_manifested(self, session, headers):
        mid = pytest.mtree_mid
        r = session.post(
            f"{API}/manifestations/{mid}/manifested",
            json={"testimony": "TEST it worked!", "donation_amount": 108},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        m = r.json()
        _no_mongo_id(m)
        assert m["status"] == "manifested"
        assert m["testimony"] == "TEST it worked!"
        assert m["donation_amount"] == 108
        assert m["donated"] is True

    def test_garden_has_entry(self, session, headers):
        r = session.get(f"{API}/garden", headers=headers)
        assert r.status_code == 200
        garden = r.json()
        _no_mongo_id(garden)
        assert isinstance(garden, list)
        assert len(garden) >= 1
        entry = garden[0]
        assert "manifestation" in entry
        assert entry["manifestation"]["status"] == "manifested"

    def test_abandon_manifestation(self, session, headers):
        # create fresh then abandon
        r = session.post(f"{API}/manifestations",
                         json=self._create_payload(), headers=headers)
        assert r.status_code == 200
        mid = r.json()["id"]
        r2 = session.post(f"{API}/manifestations/{mid}/abandon", headers=headers)
        assert r2.status_code == 200
        assert r2.json().get("ok") is True
        r3 = session.get(f"{API}/manifestations/active", headers=headers)
        assert r3.status_code == 200
        # active should be None (no other active)
        assert r3.json() is None


# ---------------- Subscribe + Community Gating ----------------
class TestSubscriptionAndCommunity:
    def test_new_user_is_premium_by_default_wall_accessible(self, session):
        # NOTE (updated per PRD Feb-2026 decision): payments stubbed, ALL new
        # users (dev-login or real Google) get is_premium=True by default.
        # This replaces the old stale test asserting 403-for-free-user, which
        # is no longer a valid scenario in this app version.
        free_email = f"TEST_newuser_{RUN_TAG}@mtree.dev"
        r_login = session.post(f"{API}/auth/dev-login",
                               params={"email": free_email, "name": "New U"})
        assert r_login.status_code == 200
        assert r_login.json()["user"]["is_premium"] is True
        tok = r_login.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}"}
        r = session.get(f"{API}/community/wall", headers=h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        r2 = session.get(f"{API}/community/leaderboard", headers=h)
        assert r2.status_code == 200
        r3 = session.post(f"{API}/community/save/random-id-xyz", headers=h)
        assert r3.status_code == 200

    def test_subscribe_marks_premium(self, session, headers):
        r = session.post(f"{API}/subscribe", json={"plan": "monthly"},
                         headers=headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_premium"] is True
        assert d["plan"] == "monthly"
        assert d["expires_at"]

        # verify /auth/me reflects premium
        me = session.get(f"{API}/auth/me", headers=headers).json()
        assert me["is_premium"] is True

    @pytest.mark.parametrize("plan", ["first_month", "6_month", "yearly"])
    def test_subscribe_other_plans(self, session, headers, plan):
        r = session.post(f"{API}/subscribe", json={"plan": plan},
                         headers=headers)
        assert r.status_code == 200
        assert r.json()["is_premium"] is True

    def test_wall_returns_list_for_premium(self, session, headers):
        r = session.get(f"{API}/community/wall", headers=headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        _no_mongo_id(items)

    def test_leaderboard_returns_list_for_premium(self, session, headers):
        r = session.get(f"{API}/community/leaderboard", headers=headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        _no_mongo_id(items)
        # sorted by max_streak desc
        streaks = [x.get("max_streak", 0) for x in items]
        assert streaks == sorted(streaks, reverse=True)

    def test_save_and_retrieve_saved(self, session, headers):
        # find some manifestation id from leaderboard
        r = session.get(f"{API}/community/leaderboard", headers=headers)
        items = r.json()
        if not items:
            pytest.skip("No manifestations available for save test")
        mid = items[0]["id"]
        # Ensure we start from an unsaved state: if it's already in saved list
        # (from previous run), unsave first.
        r_pre = session.get(f"{API}/community/saved", headers=headers)
        assert r_pre.status_code == 200
        if any(x["id"] == mid for x in r_pre.json()):
            session.post(f"{API}/community/save/{mid}", headers=headers)
        r_save = session.post(f"{API}/community/save/{mid}", headers=headers)
        assert r_save.status_code == 200
        assert r_save.json() == {"saved": True}
        r_list = session.get(f"{API}/community/saved", headers=headers)
        assert r_list.status_code == 200
        saved = r_list.json()
        _no_mongo_id(saved)
        assert any(x["id"] == mid for x in saved)
        # saved list must contain FULL manifestation records, not bare ids
        item = next(x for x in saved if x["id"] == mid)
        for f in ("user_id", "goal_category", "cycle_days", "status",
                  "current_day", "tree_stage", "created_at"):
            assert f in item, f"Saved manifestation missing field '{f}'"

    def test_save_endpoint_toggles(self, session, headers):
        """First call saves ({saved: true}), second call unsaves ({saved: false})
        and the item disappears from GET /community/saved."""
        r = session.get(f"{API}/community/leaderboard", headers=headers)
        items = r.json()
        if not items:
            pytest.skip("No manifestations available for toggle test")
        # Use a distinct id from the previous test so state is deterministic
        mid = items[-1]["id"] if len(items) > 1 else items[0]["id"]

        # Normalize to unsaved: if currently in saved list, toggle once to remove
        r_pre = session.get(f"{API}/community/saved", headers=headers)
        if any(x["id"] == mid for x in r_pre.json()):
            r_reset = session.post(f"{API}/community/save/{mid}", headers=headers)
            assert r_reset.status_code == 200
            assert r_reset.json() == {"saved": False}

        # First call -> saved: True
        r1 = session.post(f"{API}/community/save/{mid}", headers=headers)
        assert r1.status_code == 200
        assert r1.json() == {"saved": True}, f"expected saved:true, got {r1.json()}"
        r_saved1 = session.get(f"{API}/community/saved", headers=headers).json()
        assert any(x["id"] == mid for x in r_saved1)

        # Second call -> saved: False (toggle off)
        r2 = session.post(f"{API}/community/save/{mid}", headers=headers)
        assert r2.status_code == 200
        assert r2.json() == {"saved": False}, f"expected saved:false, got {r2.json()}"
        r_saved2 = session.get(f"{API}/community/saved", headers=headers).json()
        assert not any(x["id"] == mid for x in r_saved2), \
            "Unsaved manifestation still appears in GET /community/saved"

    def test_wall_only_returns_manifested_status(self, session):
        """Iteration-4: GET /community/wall must return ONLY items where
        status == 'manifested'. Seed a fresh user with one active, one
        manifested, and one abandoned manifestation; subscribe to premium;
        fetch wall; assert every returned item has status == 'manifested'
        and that this user's active/abandoned ids do NOT appear."""
        email = f"TEST_wallfilter_{RUN_TAG}@mtree.dev"
        r = session.post(f"{API}/auth/dev-login",
                         params={"email": email, "name": "Wall Filter U"})
        assert r.status_code == 200
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}",
             "Content-Type": "application/json"}

        payload = {
            "goal_category": "money",
            "goal_description": "TEST wall-filter",
            "sacrifice_category": "sugar",
            "sacrifice_description": "TEST",
            "cycle_days": 21,
            "reminder_count": 0,
            "affirmation_enabled": False,
            "fasting_enabled": False,
            "is_public": True,
        }
        # 1) create -> manifested
        r1 = session.post(f"{API}/manifestations", json=payload, headers=h)
        assert r1.status_code == 200
        m1_id = r1.json()["id"]
        r_mf = session.post(
            f"{API}/manifestations/{m1_id}/manifested",
            json={"testimony": "TEST manifested", "donation_amount": 0},
            headers=h,
        )
        assert r_mf.status_code == 200
        assert r_mf.json()["status"] == "manifested"

        # 2) create -> abandon
        r2 = session.post(f"{API}/manifestations", json=payload, headers=h)
        assert r2.status_code == 200
        m2_id = r2.json()["id"]
        r_ab = session.post(f"{API}/manifestations/{m2_id}/abandon",
                            headers=h)
        assert r_ab.status_code == 200

        # 3) create -> leave active
        r3 = session.post(f"{API}/manifestations", json=payload, headers=h)
        assert r3.status_code == 200
        m3_id = r3.json()["id"]

        # subscribe for premium access
        r_sub = session.post(f"{API}/subscribe", json={"plan": "monthly"},
                             headers=h)
        assert r_sub.status_code == 200
        assert r_sub.json()["is_premium"] is True

        # Wall must ONLY contain manifested items
        r_wall = session.get(f"{API}/community/wall", headers=h)
        assert r_wall.status_code == 200
        items = r_wall.json()
        assert isinstance(items, list)
        _no_mongo_id(items)
        bad = [x for x in items if x.get("status") != "manifested"]
        assert not bad, (
            f"Wall returned {len(bad)} non-manifested item(s); "
            f"statuses seen: {sorted({x.get('status') for x in items})}"
        )
        # This user's abandoned/active ids MUST NOT appear on the wall
        ids = {x["id"] for x in items}
        assert m2_id not in ids, "Abandoned manifestation leaked onto wall"
        assert m3_id not in ids, "Active manifestation leaked onto wall"
        # Note: $sample size 50 makes it non-deterministic whether m1_id is
        # in the returned page when the collection is large, so we do NOT
        # assert its presence — the filter correctness is proven by the
        # exclusion of m2/m3 and the status invariant above.

    def test_hustle_enabled_create_and_read(self, session):
        """Iteration-5: POST /manifestations accepts hustle_enabled and it
        persists across GET /manifestations/active and (for public+manifested)
        the /community/wall + /community/saved endpoints."""
        email = f"TEST_hustle_{RUN_TAG}@mtree.dev"
        r = session.post(f"{API}/auth/dev-login",
                         params={"email": email, "name": "Hustle U"})
        assert r.status_code == 200
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}",
             "Content-Type": "application/json"}

        payload = {
            "goal_category": "career",
            "goal_description": "TEST hustle field",
            "sacrifice_category": "sugar",
            "sacrifice_description": "TEST",
            "cycle_days": 21,
            "reminder_count": 0,
            "affirmation_enabled": False,
            "fasting_enabled": False,
            "hustle_enabled": True,
            "is_public": True,
        }
        # 1) POST create -> hustle_enabled must round-trip as True
        r_c = session.post(f"{API}/manifestations", json=payload, headers=h)
        assert r_c.status_code == 200, r_c.text
        created = r_c.json()
        _no_mongo_id(created)
        assert created["hustle_enabled"] is True, \
            f"POST response missing hustle_enabled=True: {created.get('hustle_enabled')}"
        mid = created["id"]

        # 2) GET /manifestations/active must include hustle_enabled=True
        r_a = session.get(f"{API}/manifestations/active", headers=h)
        assert r_a.status_code == 200
        active = r_a.json()
        assert active is not None and active["id"] == mid
        assert active["hustle_enabled"] is True, \
            f"active response missing hustle_enabled: {active}"

        # 3) Default value must be False when not supplied
        default_payload = {**payload}
        default_payload.pop("hustle_enabled")
        r_d = session.post(f"{API}/manifestations", json=default_payload,
                           headers=h)
        assert r_d.status_code == 200
        default_m = r_d.json()
        assert default_m["hustle_enabled"] is False, \
            f"default hustle_enabled should be False, got {default_m.get('hustle_enabled')}"

        # 4) Mark first manifestation (the one with hustle_enabled=True) as
        # manifested so it can appear on the wall. But it was abandoned by
        # the second POST — re-create with hustle_enabled=True and manifest.
        r_e = session.post(f"{API}/manifestations",
                           json=payload, headers=h)
        assert r_e.status_code == 200
        mid2 = r_e.json()["id"]
        assert r_e.json()["hustle_enabled"] is True
        r_mf = session.post(
            f"{API}/manifestations/{mid2}/manifested",
            json={"testimony": "TEST hustle worked", "donation_amount": 0},
            headers=h,
        )
        assert r_mf.status_code == 200
        assert r_mf.json()["hustle_enabled"] is True, \
            "manifested response should preserve hustle_enabled"

        # 5) Subscribe -> wall must include hustle_enabled on items
        r_sub = session.post(f"{API}/subscribe", json={"plan": "monthly"},
                             headers=h)
        assert r_sub.status_code == 200

        r_w = session.get(f"{API}/community/wall", headers=h)
        assert r_w.status_code == 200
        items = r_w.json()
        assert isinstance(items, list) and len(items) > 0
        # Every item's hustle_enabled (when present) must be a bool.
        # Note: legacy manifestations created before iteration-5 may not
        # carry the field yet — the DB is not migrated. Assert type only
        # when the key exists; the deterministic /community/saved check
        # below proves the new field round-trips end-to-end.
        for it in items:
            if "hustle_enabled" in it:
                assert isinstance(it["hustle_enabled"], bool)

        # 6) Save + saved list must also carry hustle_enabled
        r_save = session.post(f"{API}/community/save/{mid2}", headers=h)
        assert r_save.status_code == 200
        r_saved = session.get(f"{API}/community/saved", headers=h)
        assert r_saved.status_code == 200
        saved = r_saved.json()
        target = next((x for x in saved if x["id"] == mid2), None)
        assert target is not None, "saved manifestation not returned"
        assert target["hustle_enabled"] is True, \
            f"saved list should carry hustle_enabled=True, got {target.get('hustle_enabled')}"

    def test_moon_phase_at_start_create_and_read(self, session):
        """Iteration-6: POST /manifestations accepts moon_phase_at_start and it
        persists across GET /manifestations/active, /community/wall, and
        /community/saved."""
        email = f"TEST_moon_{RUN_TAG}@mtree.dev"
        r = session.post(f"{API}/auth/dev-login",
                         params={"email": email, "name": "Moon U"})
        assert r.status_code == 200
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}",
             "Content-Type": "application/json"}

        moon_name = "Prakash"
        payload = {
            "goal_category": "spiritual",
            "goal_description": "TEST moon phase field",
            "sacrifice_category": "sugar",
            "sacrifice_description": "TEST",
            "cycle_days": 21,
            "reminder_count": 0,
            "affirmation_enabled": False,
            "fasting_enabled": False,
            "hustle_enabled": False,
            "moon_phase_at_start": moon_name,
            "is_public": True,
        }

        # 1) POST create -> moon_phase_at_start must round-trip
        r_c = session.post(f"{API}/manifestations", json=payload, headers=h)
        assert r_c.status_code == 200, r_c.text
        created = r_c.json()
        _no_mongo_id(created)
        assert created.get("moon_phase_at_start") == moon_name, \
            f"POST response missing moon_phase_at_start: {created.get('moon_phase_at_start')}"
        mid = created["id"]

        # 2) GET /manifestations/active must include it
        r_a = session.get(f"{API}/manifestations/active", headers=h)
        assert r_a.status_code == 200
        active = r_a.json()
        assert active is not None and active["id"] == mid
        assert active.get("moon_phase_at_start") == moon_name, \
            f"active response missing moon_phase_at_start: {active}"

        # 3) Default value must be None when not supplied
        default_payload = {**payload}
        default_payload.pop("moon_phase_at_start")
        r_d = session.post(f"{API}/manifestations", json=default_payload,
                           headers=h)
        assert r_d.status_code == 200
        default_m = r_d.json()
        assert default_m.get("moon_phase_at_start") is None, \
            f"default moon_phase_at_start should be None, got {default_m.get('moon_phase_at_start')}"

        # 4) Re-create with moon_phase_at_start=Prakash and mark manifested
        r_e = session.post(f"{API}/manifestations", json=payload, headers=h)
        assert r_e.status_code == 200
        mid2 = r_e.json()["id"]
        assert r_e.json().get("moon_phase_at_start") == moon_name
        r_mf = session.post(
            f"{API}/manifestations/{mid2}/manifested",
            json={"testimony": "TEST moon worked", "donation_amount": 0},
            headers=h,
        )
        assert r_mf.status_code == 200
        assert r_mf.json().get("moon_phase_at_start") == moon_name, \
            "manifested response should preserve moon_phase_at_start"

        # 5) Subscribe for premium and check wall carries the field on items
        r_sub = session.post(f"{API}/subscribe", json={"plan": "monthly"},
                             headers=h)
        assert r_sub.status_code == 200

        r_w = session.get(f"{API}/community/wall", headers=h)
        assert r_w.status_code == 200
        items = r_w.json()
        assert isinstance(items, list) and len(items) > 0
        # When present, must be a string. Legacy pre-iteration-6 records may
        # not carry the field; assert type only.
        for it in items:
            if "moon_phase_at_start" in it and it["moon_phase_at_start"] is not None:
                assert isinstance(it["moon_phase_at_start"], str)

        # 6) Save + saved list must carry moon_phase_at_start on our record
        r_save = session.post(f"{API}/community/save/{mid2}", headers=h)
        assert r_save.status_code == 200
        r_saved = session.get(f"{API}/community/saved", headers=h)
        assert r_saved.status_code == 200
        saved = r_saved.json()
        target = next((x for x in saved if x["id"] == mid2), None)
        assert target is not None, "saved manifestation not returned"
        assert target.get("moon_phase_at_start") == moon_name, \
            f"saved list should carry moon_phase_at_start='{moon_name}', got {target.get('moon_phase_at_start')}"

    def test_wall_items_contain_detail_fields(self, session, headers):
        """Community wall list items must include fields used by the detail popup:
        testimony, donated, donation_amount, created_at, manifested_at,
        cosmic_level_at_start."""
        r = session.get(f"{API}/community/wall", headers=headers)
        assert r.status_code == 200
        items = r.json()
        if not items:
            pytest.skip("Wall is empty; cannot verify item fields")
        required = ["testimony", "donated", "donation_amount", "created_at",
                    "manifested_at", "cosmic_level_at_start",
                    "max_streak", "deity_id", "user_name",
                    "goal_category", "sacrifice_category", "cycle_days",
                    "affirmation_enabled", "fasting_enabled", "hustle_enabled",
                    "moon_phase_at_start",
                    "current_day", "streak_count", "status"]
        # Prefer an item that actually carries moon_phase_at_start (i.e. was
        # created after iteration-6). Legacy items pre-iteration-6 may not
        # have the field yet — reported as a minor gap.
        item = next((x for x in items if "moon_phase_at_start" in x),
                    next((x for x in items if "hustle_enabled" in x), items[0]))
        missing = [f for f in required if f not in item]
        assert not missing, f"Wall item missing fields: {missing}. Keys: {list(item.keys())}"


# ---------------- Logout ----------------
class TestLogout:
    def test_logout_invalidates_token(self, session):
        # Fresh user for isolation
        email = f"TEST_logout_{RUN_TAG}@mtree.dev"
        r = session.post(f"{API}/auth/dev-login",
                         params={"email": email, "name": "Logout U"})
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}"}

        # verify token works
        assert session.get(f"{API}/auth/me", headers=h).status_code == 200

        # logout
        r_out = session.post(f"{API}/auth/logout", headers=h)
        assert r_out.status_code == 200
        assert r_out.json().get("ok") is True

        # token should no longer work
        r_after = session.get(f"{API}/auth/me", headers=h)
        assert r_after.status_code == 401


# ---------------- Session expiry sanity ----------------
class TestSessionExpiry:
    def test_session_valid_for_7_days_approx(self, session):
        """Just confirms new session works and is not immediately expired."""
        r = session.post(f"{API}/auth/dev-login",
                         params={"email": f"TEST_exp_{RUN_TAG}@mtree.dev",
                                 "name": "Exp U"})
        assert r.status_code == 200
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}"}
        r2 = session.get(f"{API}/auth/me", headers=h)
        assert r2.status_code == 200
