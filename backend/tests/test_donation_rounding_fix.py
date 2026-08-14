"""
Regression test for donation_amount int/float 422 bug fix.

Bug (iteration_8): success.tsx sent convertFromINR(tierInr, country) directly as
donation_amount, which is a float for most non-INR currencies/tiers (e.g. 501 INR ->
6.06 USD), but backend's ManifestedRequest.donation_amount is a strict Pydantic int,
causing HTTP 422 and blocking the whole manifestation-completion flow.

Fix under test (success.tsx submitDonation): Math.max(1, Math.round(convertFromINR(...)))
before sending to POST /api/manifestations/{id}/manifested.

This test replicates the exact frontend rounding logic in Python and hits the real
backend to confirm no more 422s for:
  - All 6 INR tiers as an INR user (donation_amount must equal exact tier value)
  - All 6 INR tiers as a US ($, ratePerInr 0.0121) user (previously crashed)
  - All 6 INR tiers as a KWD (ratePerInr 0.0037, very low) user (must never be 0)
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/") or "https://import-showcase-8.preview.emergentagent.com"
API = f"{BASE_URL}/api"

DONATION_TIERS_INR = [101, 201, 501, 1001, 10001, 50001]

CURRENCIES = {
    "INR": 1,
    "USD": 0.0121,
    "KWD": 0.0037,
}

COUNTRY_FOR_CURRENCY = {"INR": "IN", "USD": "US", "KWD": "KW"}


def convert_from_inr(inr_amount, rate_per_inr):
    converted = inr_amount * rate_per_inr
    if converted >= 100:
        return round(converted)
    return round(converted * 100) / 100


def frontend_donation_amount(inr_amount, rate_per_inr):
    """Mirrors success.tsx submitDonation(): Math.max(1, Math.round(convertFromINR(...)))"""
    local = convert_from_inr(inr_amount, rate_per_inr)
    return max(1, round(local))


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def dev_login(session, email):
    r = session.post(f"{API}/auth/dev-login", params={"email": email, "name": "Donation Test"})
    if r.status_code == 404:
        pytest.skip("Dev login disabled (ENABLE_DEV_LOGIN not set)")
    assert r.status_code == 200, f"dev-login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["session_token"]
    session.headers.update({"Authorization": f"Bearer {token}"})
    return data["user"]


def set_country(session, country):
    r = session.patch(f"{API}/profile", json={"country": country})
    assert r.status_code == 200, f"profile patch failed: {r.status_code} {r.text}"


def create_manifestation(session):
    payload = {
        "goal_category": "wealth",
        "sacrifice_category": "sugar",
        "cycle_days": 21,
        "is_public": False,
    }
    r = session.post(f"{API}/manifestations", json=payload)
    assert r.status_code == 200, f"create manifestation failed: {r.status_code} {r.text}"
    return r.json()["id"]


@pytest.mark.parametrize("currency_code,tier_inr", [
    (c, t) for c in ("USD", "INR", "KWD") for t in DONATION_TIERS_INR
])
def test_donation_tier_no_422(session, currency_code, tier_inr):
    """For each currency x tier combo, submitting the rounded donation_amount must succeed (200),
    never 422, and the persisted amount must never be 0/negative."""
    email = f"TEST_donation_{uuid.uuid4().hex[:8]}@mtree.dev"
    dev_login(session, email)
    set_country(session, COUNTRY_FOR_CURRENCY[currency_code])
    mid = create_manifestation(session)

    rate = CURRENCIES[currency_code]
    amount_to_send = frontend_donation_amount(tier_inr, rate)
    assert amount_to_send >= 1, "computed donation amount must never be 0"
    assert isinstance(amount_to_send, int), "computed donation amount must be an int"

    r = session.post(
        f"{API}/manifestations/{mid}/manifested",
        json={"testimony": None, "donation_amount": amount_to_send, "donation_currency": currency_code},
    )
    assert r.status_code == 200, (
        f"REGRESSION: expected 200 but got {r.status_code} for currency={currency_code} "
        f"tier={tier_inr} amount={amount_to_send}: {r.text}"
    )
    body = r.json()
    assert body["donation_amount"] == amount_to_send
    assert body["donated"] is True
    assert body["donation_amount"] >= 1

    if currency_code == "INR":
        # ratePerInr=1, so INR tiers must be sent through exactly unchanged
        assert amount_to_send == tier_inr, "INR donation amount must equal exact tier value"

    # Cleanup: mark abandoned/delete not strictly required for @mtree.dev dev users,
    # but delete the manifestation via admin path is out of scope here; leave as manifested.
