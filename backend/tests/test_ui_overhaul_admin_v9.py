"""Backend tests for mTree UI overhaul + web admin dashboard.

Covers:
- Admin password login (/api/admin/login) with hmac.compare_digest
- Admin token guards on stats / users / tickets / config
- Non-admin user session must be REJECTED (403) on admin routes
- PATCH /admin/config updates flags/prices; safely restored at end
- GET /admin/users/{id} includes current_ticket + ticket_history
- POST /admin/tickets/{id}/reply sets status=replied
- /admin/tickets excludes @mtree.dev accounts
- /app-config includes community_premium_required=false
- /community/wall works for a non-premium user (community is free)
- Full user flow: dev-login -> profile -> manifestation (burning_desire) ->
  active -> notification-response (score increments) -> ritual completion.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_PASSWORD = "MTree@Sacred#2026"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# -------------------- Admin login --------------------
@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{BASE_URL}/api/admin/login", json={"password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    assert isinstance(tok, str) and len(tok) > 10
    return tok


def test_admin_login_wrong_password(s):
    r = s.post(f"{BASE_URL}/api/admin/login", json={"password": "nope"})
    assert r.status_code == 401


# -------------------- User dev-login --------------------
@pytest.fixture(scope="module")
def user_ctx(s):
    ts = int(time.time())
    email = f"tester_{ts}@mtree.dev"
    r = s.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "UI Overhaul Tester"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["session_token"], "user": data["user"], "email": email}


# -------------------- Admin endpoints via admin token --------------------
def _ahdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_admin_stats(s, admin_token):
    r = s.get(f"{BASE_URL}/api/admin/stats", headers=_ahdr(admin_token))
    assert r.status_code == 200
    body = r.json()
    for k in ["total_users", "premium_users", "total_manifestations", "wall_posts", "open_tickets"]:
        assert k in body


def test_admin_users_list(s, admin_token):
    r = s.get(f"{BASE_URL}/api/admin/users", headers=_ahdr(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert "users" in body and "total" in body
    # excludes @mtree.dev
    for u in body["users"]:
        assert not u["email"].lower().endswith("@mtree.dev")


def test_admin_tickets_list_excludes_mtree_dev(s, admin_token, user_ctx):
    # create a ticket from the mtree.dev tester -> must NOT appear in admin listing
    r = s.post(
        f"{BASE_URL}/api/tickets",
        headers={"Authorization": f"Bearer {user_ctx['token']}"},
        json={"subject": "TEST_HIDDEN", "description": "should not appear", "attachments": []},
    )
    assert r.status_code == 200
    tid = r.json()["id"]
    r = s.get(f"{BASE_URL}/api/admin/tickets", headers=_ahdr(admin_token))
    assert r.status_code == 200
    tickets = r.json() if isinstance(r.json(), list) else r.json().get("tickets", [])
    ids = [t.get("id") for t in tickets]
    assert tid not in ids, "Admin tickets list should exclude @mtree.dev accounts"


def test_admin_config_get_and_patch_roundtrip(s, admin_token):
    # Read current
    r = s.get(f"{BASE_URL}/api/admin/config", headers=_ahdr(admin_token))
    assert r.status_code == 200
    cfg = r.json()
    for k in ("ads_enabled", "subscriptions_enabled", "community_premium_required",
              "subscription_prices", "donation_prices"):
        assert k in cfg

    # Update
    payload = {
        "ads_enabled": True,
        "subscriptions_enabled": True,
        "community_premium_required": True,
        "subscription_prices": {"first_month": 33, "monthly": 55, "6_month": 260, "yearly": 420},
        "donation_prices": [111, 222, 555, 1111],
    }
    r = s.patch(f"{BASE_URL}/api/admin/config", headers=_ahdr(admin_token), json=payload)
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["ads_enabled"] is True
    assert updated["subscriptions_enabled"] is True
    assert updated["community_premium_required"] is True
    assert updated["subscription_prices"]["monthly"] == 55
    assert updated["donation_prices"] == [111, 222, 555, 1111]

    # Restore defaults (per review-request note)
    restore = {
        "ads_enabled": False,
        "subscriptions_enabled": False,
        "community_premium_required": False,
        "subscription_prices": {"first_month": 29, "monthly": 49, "6_month": 249, "yearly": 399},
        "donation_prices": [101, 201, 501, 1001, 10001, 50001],
    }
    r = s.patch(f"{BASE_URL}/api/admin/config", headers=_ahdr(admin_token), json=restore)
    assert r.status_code == 200
    final = r.json()
    assert final["ads_enabled"] is False
    assert final["subscriptions_enabled"] is False
    assert final["community_premium_required"] is False
    assert final["subscription_prices"]["monthly"] == 49


# -------------------- User session must be rejected on admin routes --------------------
def test_user_token_rejected_on_admin(s, user_ctx):
    hdr = {"Authorization": f"Bearer {user_ctx['token']}"}
    for path in ["/api/admin/stats", "/api/admin/users", "/api/admin/tickets", "/api/admin/config"]:
        r = s.get(f"{BASE_URL}{path}", headers=hdr)
        assert r.status_code == 403, f"{path} expected 403, got {r.status_code}"


# -------------------- App-config for user (community free flag) --------------------
def test_app_config_community_free(s, user_ctx):
    r = s.get(f"{BASE_URL}/api/app-config", headers={"Authorization": f"Bearer {user_ctx['token']}"})
    assert r.status_code == 200
    body = r.json()
    assert body.get("community_premium_required") is False


def test_community_wall_free_for_non_premium(s, user_ctx):
    r = s.get(f"{BASE_URL}/api/community/wall", headers={"Authorization": f"Bearer {user_ctx['token']}"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# -------------------- Full user flow --------------------
def test_full_user_flow(s, user_ctx, admin_token):
    hdr = {"Authorization": f"Bearer {user_ctx['token']}"}

    # PATCH profile
    r = s.patch(f"{BASE_URL}/api/profile", headers=hdr, json={"deity_id": 1, "affirmation_language": "english"})
    assert r.status_code == 200
    assert r.json()["deity_id"] == 1

    # Create manifestation with burning_desire (required)
    payload = {
        "goal_category": "wealth",
        "burning_desire": "TEST_v9 I feel abundant every day.",
        "sacrifice_category": "junk_food",
        "cycle_days": 21,
        "reminder_count": 3,
        "reminder_mode": "random",
    }
    r = s.post(f"{BASE_URL}/api/manifestations", headers=hdr, json=payload)
    assert r.status_code == 200, r.text
    mid = r.json()["id"]

    # Missing burning_desire -> 422
    bad = dict(payload); bad.pop("burning_desire")
    r = s.post(f"{BASE_URL}/api/manifestations", headers=hdr, json=bad)
    assert r.status_code == 422

    # Active manifestation
    r = s.get(f"{BASE_URL}/api/manifestations/active", headers=hdr)
    assert r.status_code == 200 and r.json()["id"] == mid

    # Notification-response increments score
    before = r.json().get("notification_score", 0)
    r = s.post(
        f"{BASE_URL}/api/manifestations/{mid}/notification-response",
        headers=hdr,
        json={"event_id": f"evt_{int(time.time()*1000)}", "local_date": "2026-01-15", "kind": "reminder"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["recorded"] is True
    assert body["notification_score"] == before + 1

    # Ritual completion
    r = s.post(
        f"{BASE_URL}/api/manifestations/{mid}/ritual",
        headers=hdr,
        json={"local_date": "2026-01-15"},
    )
    assert r.status_code == 200
    rj = r.json()
    assert rj["manifestation"]["current_day"] == 1
    assert rj["manifestation"]["streak_count"] == 1

    # Already-done same day -> 400
    r = s.post(f"{BASE_URL}/api/manifestations/{mid}/ritual", headers=hdr, json={"local_date": "2026-01-15"})
    assert r.status_code == 400

    # Admin user-detail returns current_ticket + ticket_history keys
    r = s.get(f"{BASE_URL}/api/admin/users/{user_ctx['user']['user_id']}", headers=_ahdr(admin_token))
    assert r.status_code == 200
    detail = r.json()
    assert "current_ticket" in detail and "ticket_history" in detail
    tid = detail.get("current_ticket", {}).get("id") if detail.get("current_ticket") else None
    if tid:
        r = s.post(
            f"{BASE_URL}/api/admin/tickets/{tid}/reply",
            headers=_ahdr(admin_token),
            json={"reply": "TEST reply from admin"},
        )
        assert r.status_code == 200
        assert r.json().get("status") == "replied"


# -------------------- Admin dashboard HTML --------------------
def test_admin_dashboard_html_served(s):
    r = s.get(f"{BASE_URL}/api/admin-dashboard")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")
    assert "<html" in r.text.lower() or "<!doctype" in r.text.lower()
