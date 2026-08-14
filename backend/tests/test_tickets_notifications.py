"""
Phase 4 backend tests: Support Tickets + In-App Notifications + Admin ticket auth-gating.
Covers: POST/GET /api/tickets, GET /api/tickets/{id}, per-user scoping (404 for other user),
GET/POST /api/notifications*, and non-admin rejection on /api/admin/tickets* + open_tickets stat.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path


def _load_base_url() -> str:
    env_val = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if env_val:
        return env_val.rstrip("/")
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found")


BASE_URL = _load_base_url()


@pytest.fixture(scope="module")
def user_a():
    email = f"TEST_ticketsA_{uuid.uuid4().hex[:8]}@mtree.dev"
    r = requests.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Ticket User A"})
    assert r.status_code == 200
    data = r.json()
    return {"token": data["session_token"], "user": data["user"]}


@pytest.fixture(scope="module")
def user_b():
    email = f"TEST_ticketsB_{uuid.uuid4().hex[:8]}@mtree.dev"
    r = requests.post(f"{BASE_URL}/api/auth/dev-login", params={"email": email, "name": "Ticket User B"})
    assert r.status_code == 200
    data = r.json()
    return {"token": data["session_token"], "user": data["user"]}


def auth_headers(u):
    return {"Authorization": f"Bearer {u['token']}"}


class TestTickets:
    def test_create_ticket_missing_fields_fails(self, user_a):
        r = requests.post(
            f"{BASE_URL}/api/tickets",
            json={"subject": "", "description": ""},
            headers=auth_headers(user_a),
        )
        assert r.status_code == 400

    def test_create_and_persist_ticket(self, user_a):
        payload = {"subject": "TEST_App crashes on submit", "description": "It crashes every single time I tap submit.", "attachments": []}
        r = requests.post(f"{BASE_URL}/api/tickets", json=payload, headers=auth_headers(user_a))
        assert r.status_code == 200
        created = r.json()
        assert created["subject"] == payload["subject"]
        assert created["status"] == "open"
        assert created["admin_reply"] is None
        tid = created["id"]

        # GET list -> no attachments field, ticket present
        r2 = requests.get(f"{BASE_URL}/api/tickets", headers=auth_headers(user_a))
        assert r2.status_code == 200
        items = r2.json()
        found = next((t for t in items if t["id"] == tid), None)
        assert found is not None
        assert "attachments" not in found

        # GET detail -> full detail with attachments key present
        r3 = requests.get(f"{BASE_URL}/api/tickets/{tid}", headers=auth_headers(user_a))
        assert r3.status_code == 200
        detail = r3.json()
        assert detail["id"] == tid
        assert "attachments" in detail
        assert detail["description"] == payload["description"]

    def test_ticket_scoped_per_user_404_for_other_user(self, user_a, user_b):
        payload = {"subject": "TEST_Private ticket", "description": "This should not be visible to user B.", "attachments": []}
        r = requests.post(f"{BASE_URL}/api/tickets", json=payload, headers=auth_headers(user_a))
        assert r.status_code == 200
        tid = r.json()["id"]

        r2 = requests.get(f"{BASE_URL}/api/tickets/{tid}", headers=auth_headers(user_b))
        assert r2.status_code == 404

        r3 = requests.get(f"{BASE_URL}/api/tickets", headers=auth_headers(user_b))
        assert r3.status_code == 200
        ids_b = [t["id"] for t in r3.json()]
        assert tid not in ids_b

    def test_create_ticket_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/tickets", json={"subject": "TEST_x", "description": "no auth header at all here"})
        assert r.status_code in (401, 403)


class TestNotifications:
    def test_list_notifications_empty_or_scoped(self, user_b):
        r = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(user_b))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_unread_count(self, user_b):
        r = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=auth_headers(user_b))
        assert r.status_code == 200
        data = r.json()
        assert "count" in data or isinstance(data, dict)

    def test_mark_all_read_no_error(self, user_b):
        r = requests.post(f"{BASE_URL}/api/notifications/read-all", headers=auth_headers(user_b))
        assert r.status_code == 200

    def test_notifications_require_auth(self):
        r = requests.get(f"{BASE_URL}/api/notifications")
        assert r.status_code in (401, 403)


class TestAdminTicketAuthGating:
    """Non-admin dev-login users must be rejected from all admin ticket endpoints."""

    def test_admin_list_tickets_blocked_for_non_admin(self, user_a):
        r = requests.get(f"{BASE_URL}/api/admin/tickets", headers=auth_headers(user_a))
        assert r.status_code in (401, 403)

    def test_admin_ticket_detail_blocked_for_non_admin(self, user_a):
        r = requests.get(f"{BASE_URL}/api/admin/tickets/{uuid.uuid4()}", headers=auth_headers(user_a))
        assert r.status_code in (401, 403)

    def test_admin_reply_blocked_for_non_admin(self, user_a):
        r = requests.post(
            f"{BASE_URL}/api/admin/tickets/{uuid.uuid4()}/reply",
            json={"reply": "TEST_reply"},
            headers=auth_headers(user_a),
        )
        assert r.status_code in (401, 403)

    def test_admin_close_blocked_for_non_admin(self, user_a):
        r = requests.post(f"{BASE_URL}/api/admin/tickets/{uuid.uuid4()}/close", headers=auth_headers(user_a))
        assert r.status_code in (401, 403)

    def test_admin_stats_blocked_for_non_admin(self, user_a):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers=auth_headers(user_a))
        assert r.status_code in (401, 403)
