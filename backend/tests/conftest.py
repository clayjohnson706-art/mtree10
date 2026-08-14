"""
Session-wide safety net: automatically purges every bot/test user (and all their
manifestations/garden/saved/session/ritual/subscription data) created by ANY test in this
directory, once the full pytest session finishes. This prevents test/dummy data from ever
lingering in the Manifestation Wall or database after a test run, regardless of which test
file created it or whether that test cleaned up after itself.
"""
import pytest
from pathlib import Path
from pymongo import MongoClient

# Test users are always created with an "@mtree.dev" email (see dev-login usage across the
# suite) — anything matching this pattern is unambiguously test/bot data, never a real user.
TEST_EMAIL_SUFFIX = "mtree.dev"


def _env_value(env_path: Path, key: str) -> str:
    for line in env_path.read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError(f"{key} not found in {env_path}")


@pytest.fixture(scope="session", autouse=True)
def purge_test_data_after_session():
    yield
    env_path = Path("/app/backend/.env")
    mongo_url = _env_value(env_path, "MONGO_URL")
    db_name = _env_value(env_path, "DB_NAME")
    client = MongoClient(mongo_url)
    try:
        db = client[db_name]
        test_uids = [
            u["user_id"]
            for u in db.users.find({"email": {"$regex": f"{TEST_EMAIL_SUFFIX}$"}}, {"_id": 0, "user_id": 1})
        ]
        if not test_uids:
            return
        mids = [
            m["id"] for m in db.manifestations.find({"user_id": {"$in": test_uids}}, {"_id": 0, "id": 1})
        ]
        db.manifestations.delete_many({"user_id": {"$in": test_uids}})
        db.garden.delete_many({"user_id": {"$in": test_uids}})
        db.saved_manifestations.delete_many({"user_id": {"$in": test_uids}})
        if mids:
            db.saved_manifestations.delete_many({"manifestation_id": {"$in": mids}})
        db.user_sessions.delete_many({"user_id": {"$in": test_uids}})
        db.daily_rituals.delete_many({"user_id": {"$in": test_uids}})
        db.subscriptions.delete_many({"user_id": {"$in": test_uids}})
        db.users.delete_many({"user_id": {"$in": test_uids}})
    finally:
        client.close()
