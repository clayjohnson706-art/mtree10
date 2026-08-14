"""
mTree - New feature tests (this session):
- FEATURE 1: empty Wall returns clean empty list (post test-data purge scenario)
- FEATURE 2: reminder frequency up to 10x/day persists via PATCH /profile
- FEATURE 4b: GET /affirmations/{category}?language=X (hindi returns translated
  text, tamil falls back to english text - by design, untranslated languages)
"""
import uuid
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


def _new_user(session, tag):
    email = f"TEST_newfeat_{tag}_{RUN_TAG}@mtree.dev"
    r = session.post(f"{API}/auth/dev-login", params={"email": email, "name": "New Feat U"})
    assert r.status_code == 200
    tok = r.json()["session_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class TestAffirmationLanguage:
    def test_default_language_english(self, session):
        r = session.get(f"{API}/affirmations/money")
        assert r.status_code == 200
        d = r.json()
        assert d["language"] == "english"
        assert d["text"] == d["text_english"]

    def test_hindi_language_serves_translated_text(self, session):
        """Post-i18n-update: curated Hindi affirmation text now exists and differs from
        the English copy, while text_english always stays the English reference text."""
        r = session.get(f"{API}/affirmations/money", params={"language": "hindi"})
        assert r.status_code == 200
        d = r.json()
        assert d["language"] == "hindi"
        assert d["text"] != d["text_english"]
        assert d["text_english"] == "I am wealthy and money flows to me easily"

    def test_tamil_serves_translated_text(self, session):
        """Tamil now has curated translated affirmation text (54-language dataset)."""
        r = session.get(f"{API}/affirmations/money", params={"language": "tamil"})
        assert r.status_code == 200
        d = r.json()
        assert d["language"] == "tamil"
        assert d["text"] != d["text_english"]

    def test_response_shape_has_required_fields(self, session):
        r = session.get(f"{API}/affirmations/career", params={"language": "hindi"})
        assert r.status_code == 200
        d = r.json()
        for field in ("goal_category", "language", "text", "text_english"):
            assert field in d


class TestReminderFrequencyUpTo10:
    @pytest.mark.parametrize("n", [0, 1, 2, 3, 5, 7, 10])
    def test_notification_count_persists(self, session, n):
        h = _new_user(session, f"freq{n}")
        r = session.patch(f"{API}/profile", json={"notification_count": n}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["notification_count"] == n
        # verify via GET /auth/me
        me = session.get(f"{API}/auth/me", headers=h).json()
        assert me["notification_count"] == n


class TestEmptyWall:
    def test_wall_empty_returns_clean_empty_list_for_fresh_user_scope(self, session):
        """A brand-new user has zero manifested wall items visible under their own
        filters that can't match anything real; verify the endpoint never crashes
        and always returns a JSON list (even filtered down to zero results)."""
        h = _new_user(session, "emptywall")
        r = session.get(f"{API}/community/wall", headers=h,
                         params={"goal_category": "money",
                                 "sacrifice_category": "sugar",
                                 "cycle_days": 999999})
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # With an impossible cycle_days filter, should be empty and NOT error
        assert items == []
