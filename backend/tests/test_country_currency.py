"""
Tests for the country detection + localized currency + admin donation tracking feature set:
- PATCH /api/profile persists `country` (ISO2)
- POST /api/manifestations/{id}/manifested persists donation_currency alongside donation_amount
- GET /api/admin/users/{user_id} computes total_donated_usd across all manifestations using the
  fixed CURRENCY_RATE_PER_INR table (INR pivot)
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from pathlib import Path

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/") or None


def _env_value(key: str) -> str:
    for line in Path("/app/backend/.env").read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError(f"{key} not found")


@pytest.fixture(scope="session")
def base_url():
    url = os.environ.get("EXPO_BACKEND_URL")
    if not url:
        pytest.skip("EXPO_BACKEND_URL not set")
    return url.rstrip("/") + "/api"


@pytest.fixture(scope="session")
def admin_token():
    """Inserts a temp session doc for the EXISTING real admin user (does not create a
    duplicate user doc, does not touch any existing real session token) — mirrors the
    pattern used in test_admin_guard.py. Cleaned up after the session finishes."""
    import secrets
    from datetime import datetime, timedelta, timezone
    client = MongoClient(_env_value("MONGO_URL"))
    db = client[_env_value("DB_NAME")]
    u = db.users.find_one({"email": "nextleveldev706@gmail.com"})
    if not u:
        client.close()
        pytest.skip("admin user not found in DB")
    token = f"testtok_{secrets.token_urlsafe(24)}"
    now = datetime.now(timezone.utc)
    db.user_sessions.insert_one({
        "session_token": token, "user_id": u["user_id"],
        "created_at": now, "expires_at": now + timedelta(hours=1),
    })
    yield token
    db.user_sessions.delete_one({"session_token": token})
    client.close()


@pytest.fixture()
def test_user(base_url):
    """Creates a throwaway @mtree.dev dev-login user, yields (session, user), cleans up after."""
    email = f"TEST_country_{uuid.uuid4().hex[:8]}@mtree.dev"
    r = requests.post(f"{base_url}/auth/dev-login", params={"email": email, "name": "Test Country User"})
    assert r.status_code == 200
    data = r.json()
    token = data["session_token"]
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    yield session, data["user"]
    # cleanup handled by conftest session-scoped purge too, but do it eagerly here
    try:
        session.delete(f"{base_url}/account")
    except Exception:
        pass


class TestProfileCountry:
    def test_patch_profile_persists_country(self, base_url, test_user):
        session, user = test_user
        r = session.patch(f"{base_url}/profile", json={"country": "GB"})
        assert r.status_code == 200
        assert r.json()["country"] == "GB"

        # verify via GET /api/auth/me
        r2 = session.get(f"{base_url}/auth/me")
        assert r2.status_code == 200
        assert r2.json()["country"] == "GB"

    def test_patch_profile_country_change_persists(self, base_url, test_user):
        session, user = test_user
        session.patch(f"{base_url}/profile", json={"country": "US"})
        r = session.patch(f"{base_url}/profile", json={"country": "IN"})
        assert r.status_code == 200
        assert r.json()["country"] == "IN"
        r2 = session.get(f"{base_url}/auth/me")
        assert r2.json()["country"] == "IN"


class TestManifestedDonationCurrency:
    def _create_active_manifestation(self, session, base_url):
        payload = {
            "goal_category": "wealth", "sacrifice_category": "sugar",
            "cycle_days": 21, "reminder_count": 0, "reminder_mode": "random",
            "reminder_times": [], "is_public": True,
        }
        r = session.post(f"{base_url}/manifestations", json=payload)
        assert r.status_code == 200
        return r.json()["id"]

    def test_manifested_persists_donation_currency_gbp(self, base_url, test_user):
        session, user = test_user
        mid = self._create_active_manifestation(session, base_url)
        r = session.post(
            f"{base_url}/manifestations/{mid}/manifested",
            json={"testimony": "test", "donation_amount": 15, "donation_currency": "GBP"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["donation_amount"] == 15
        assert body["donation_currency"] == "GBP"
        assert body["donated"] is True

    def test_manifested_default_currency_inr(self, base_url, test_user):
        session, user = test_user
        mid = self._create_active_manifestation(session, base_url)
        r = session.post(
            f"{base_url}/manifestations/{mid}/manifested",
            json={"testimony": None, "donation_amount": 0, "donation_currency": "INR"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["donation_currency"] == "INR"
        assert body["donated"] is False


class TestAdminTotalDonatedUsd:
    def _create_manifested(self, session, base_url, amount, currency):
        payload = {
            "goal_category": "wealth", "sacrifice_category": "sugar",
            "cycle_days": 21, "reminder_count": 0, "reminder_mode": "random",
            "reminder_times": [], "is_public": True,
        }
        r = session.post(f"{base_url}/manifestations", json=payload)
        mid = r.json()["id"]
        r2 = session.post(
            f"{base_url}/manifestations/{mid}/manifested",
            json={"testimony": None, "donation_amount": amount, "donation_currency": currency},
        )
        assert r2.status_code == 200
        return mid

    def test_total_donated_usd_multi_currency(self, base_url, admin_token, test_user):
        session, user = test_user
        user_id = user["user_id"]

        # $25 USD donation
        self._create_manifested(session, base_url, 25, "USD")
        # 2000 INR donation -> creating a 2nd manifestation requires abandoning the active one,
        # which create_manifestation does automatically.
        self._create_manifested(session, base_url, 2000, "INR")

        admin_session = requests.Session()
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        r = admin_session.get(f"{base_url}/admin/users/{user_id}")
        assert r.status_code == 200
        data = r.json()
        assert "total_donated_usd" in data
        # 25 USD + 2000*0.0121 = 25 + 24.2 = 49.2
        assert abs(data["total_donated_usd"] - 49.2) < 0.05

    def test_total_donated_usd_single_gbp(self, base_url, admin_token, test_user):
        session, user = test_user
        user_id = user["user_id"]
        self._create_manifested(session, base_url, 15, "GBP")

        admin_session = requests.Session()
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        r = admin_session.get(f"{base_url}/admin/users/{user_id}")
        assert r.status_code == 200
        data = r.json()
        # 15 GBP -> INR = 15/0.0095 = 1578.94..., -> USD = *0.0121 = 19.10...
        assert abs(data["total_donated_usd"] - 19.11) < 0.1

    def test_admin_user_list_includes_country(self, base_url, admin_token, test_user):
        session, user = test_user
        session.patch(f"{base_url}/profile", json={"country": "GB"})

        admin_session = requests.Session()
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        r = admin_session.get(f"{base_url}/admin/users", params={"search": user["email"]})
        assert r.status_code == 200
        users = r.json()["users"]
        assert len(users) >= 1
        assert users[0]["country"] == "GB"

    def test_admin_get_user_includes_country_field(self, base_url, admin_token, test_user):
        session, user = test_user
        session.patch(f"{base_url}/profile", json={"country": "US"})
        user_id = user["user_id"]

        admin_session = requests.Session()
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        r = admin_session.get(f"{base_url}/admin/users/{user_id}")
        assert r.status_code == 200
        assert r.json()["user"]["country"] == "US"
