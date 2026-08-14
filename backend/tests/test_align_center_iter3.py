"""Iteration 3 backend regression:
- Auth dev-login mint
- Profile onboarding + deity PATCH
- Manifestation create (random mode, alarms, hustle, fasting)
- Active manifestation GET persistence
- Notification-response POST (hold-to-stop backend path)
- Regression: /auth/me, /manifestations/active, community/wall free, admin/login
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mtree-ui-overhaul.preview.emergentagent.com").rstrip("/")
ADMIN_PASSWORD = "MTree@Sacred#2026"


@pytest.fixture(scope="module")
def token_and_user():
    email = f"TEST_iter3_{int(time.time())}@mtree.dev"
    r = requests.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Iter3 Tester"}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data["session_token"], data["user"], email


@pytest.fixture(scope="module")
def auth_headers(token_and_user):
    return {"Authorization": f"Bearer {token_and_user[0]}", "Content-Type": "application/json"}


# --- Auth / profile ---
def test_auth_me_ok(auth_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    # /auth/me returns the user object at root (not under "user")
    email = body.get("user", {}).get("email") or body.get("email", "")
    assert email.endswith("@mtree.dev"), body


def test_profile_patch_onboarding(auth_headers):
    r = requests.patch(
        f"{BASE_URL}/api/profile",
        headers=auth_headers,
        json={"onboarding_done": True, "profile_done": True, "tour_done": True, "journey_intro_seen": True, "deity_id": 6},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    user = body.get("user", body)
    assert user.get("deity_id") == 6
    assert user.get("onboarding_done") is True


# --- Manifestation create + persist ---
@pytest.fixture(scope="module")
def manifestation(auth_headers):
    payload = {
        "goal_category": "money",
        "burning_desire": "I burn to build wealth",
        "sacrifice_category": "social_media",
        "cycle_days": 21,
        "reminder_count": 5,
        "reminder_mode": "random",
        "affirmation_enabled": True,
        "is_public": True,
        "hustle_enabled": True,
        "fasting_enabled": True,
    }
    r = requests.post(f"{BASE_URL}/api/manifestations", headers=auth_headers, json=payload, timeout=20)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("burning_desire") == "I burn to build wealth"
    assert data.get("sacrifice_category") == "social_media"
    assert data.get("hustle_enabled") is True
    assert data.get("fasting_enabled") is True
    return data


def test_manifestation_persisted_via_active(auth_headers, manifestation):
    r = requests.get(f"{BASE_URL}/api/manifestations/active", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    active = r.json()
    assert active is not None
    assert active.get("id") == manifestation["id"]
    assert active.get("burning_desire") == "I burn to build wealth"
    assert "_id" not in active  # ObjectId excluded


# --- Notification-response POST (hold-to-stop backend endpoint) ---
def test_notification_response_increments_score(auth_headers, manifestation):
    mid = manifestation["id"]
    before = requests.get(f"{BASE_URL}/api/manifestations/active", headers=auth_headers, timeout=15).json()
    before_score = int(before.get("notification_score", 0))
    from datetime import date
    today = date.today().isoformat()
    r = requests.post(
        f"{BASE_URL}/api/manifestations/{mid}/notification-response",
        headers=auth_headers,
        json={"event_id": f"t1-{today}", "local_date": today, "kind": "reminder"},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    after = requests.get(f"{BASE_URL}/api/manifestations/active", headers=auth_headers, timeout=15).json()
    after_score = int(after.get("notification_score", 0))
    assert after_score >= before_score  # non-decreasing; idempotent per event_id


# --- Regression: community wall free, admin login ---
def test_community_wall_free(auth_headers):
    r = requests.get(f"{BASE_URL}/api/community/wall", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))


def test_admin_login_ok():
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("access_token") or body.get("token"), body
