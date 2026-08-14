from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import hmac
import secrets
from hashlib import sha256
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from fastapi.responses import HTMLResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import json as _json

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="mTree API")
api_router = APIRouter(prefix="/api")

# ------------------- Seed data -------------------
DEITIES = [
    {"id": 1, "name": "Zorath", "color_hex": "#FF6B35", "glow_hex": "#FF6B3540",
     "symbol_description": "Spiral flame with three pointed tips", "stone_texture": "rough dark stone"},
    {"id": 2, "name": "Kaelis", "color_hex": "#4E9AF1", "glow_hex": "#4E9AF140",
     "symbol_description": "Infinite loop wave with central eye", "stone_texture": "weathered gray stone"},
    {"id": 3, "name": "Tharun", "color_hex": "#45B764", "glow_hex": "#45B76440",
     "symbol_description": "Rooted triangle with branching lines", "stone_texture": "mossy brown stone"},
    {"id": 4, "name": "Vynel", "color_hex": "#C8D0DB", "glow_hex": "#C8D0DB40",
     "symbol_description": "Vortex of concentric spirals", "stone_texture": "pale ash stone"},
    {"id": 5, "name": "Aethis", "color_hex": "#A855F7", "glow_hex": "#A855F740",
     "symbol_description": "Star burst with 8 points connected by arcs", "stone_texture": "obsidian-dark stone"},
    {"id": 6, "name": "Solmara", "color_hex": "#FACC15", "glow_hex": "#FACC1540",
     "symbol_description": "Disc with radiating geometric rays and dot center", "stone_texture": "sandstone"},
    {"id": 7, "name": "Luneth", "color_hex": "#93C5FD", "glow_hex": "#93C5FD40",
     "symbol_description": "Crescent embracing a circle haloed by dots", "stone_texture": "cool blue-gray stone"},
]

CHANDRA_DASA = [
    {"day_number": i, "name": f"[CHANDRA_DASA_{i}]", "description": f"Day {i} energy"}
    for i in range(1, 31)
]

# Fallback English-only text for categories that have no curated multi-language content yet
# (namely the free-text "custom" goal). Real per-category, per-language affirmations live in
# AFFIRMATIONS_I18N below and are the primary source served by /affirmations/{category}.
AFFIRMATIONS = {
    "custom": "My intention is pure and my will is unstoppable. What I seek is already seeking me.",
}

# Curated affirmations across 35 goal categories x 54 languages, loaded from a static data file
# (data/affirmations_i18n.json). Structure: { category_id: { lang_code: text } }.
try:
    with open(ROOT_DIR / "data" / "affirmations_i18n.json", "r", encoding="utf-8") as _f:
        AFFIRMATIONS_I18N = _json.load(_f)
except Exception:
    AFFIRMATIONS_I18N = {}

# Some legacy goal_category keys used before the category expansion don't match the new
# curated data 1:1 — map them onto their closest equivalent so existing users still get text.
CATEGORY_ALIASES = {
    "relationship": "love",
}

# Fixed, short ritual/notification UI phrases (sacrifice chant, chant instructions, "take deep
# breaths", etc.) translated into all 53 languages, loaded from a static data file
# (data/ui_strings_i18n.json, generated once via generate_ui_strings_i18n.py). {{SACRIFICE}}/
# {{GOAL}} placeholders inside "sacrifice_template" are preserved literally — the frontend
# substitutes them with the user's actual (English) sacrifice/goal category names, since no
# per-category-name translation data exists yet.
try:
    with open(ROOT_DIR / "data" / "ui_strings_i18n.json", "r", encoding="utf-8") as _f:
        UI_STRINGS_I18N = _json.load(_f)
except Exception:
    UI_STRINGS_I18N = {}

# Goal/Sacrifice category label translations (e.g. "Wealth" -> "धन" in Hindi), keyed by the
# category `key` used in GOAL_CATEGORIES/SACRIFICE_CATEGORIES (frontend/src/theme/index.ts) —
# loaded from a static data file (data/category_labels_i18n.json, generated once via
# generate_category_labels_i18n.py). Used to translate the actual goal/sacrifice NAME embedded
# in the sacrifice-affirmation sentence, on top of the surrounding template words already
# covered by UI_STRINGS_I18N above.
try:
    with open(ROOT_DIR / "data" / "category_labels_i18n.json", "r", encoding="utf-8") as _f:
        CATEGORY_LABELS_I18N = _json.load(_f)
except Exception:
    CATEGORY_LABELS_I18N = {}

# Frontend language slugs (used everywhere in the app/DB) -> 2/3-letter codes used in the
# curated affirmations data file.
LANGUAGE_CODE_MAP = {
    "english": "en", "hindi": "hi", "assamese": "as", "bengali": "bn", "bodo": "brx",
    "dogri": "doi", "gujarati": "gu", "kannada": "kn", "kashmiri": "ks", "konkani": "kok",
    "maithili": "mai", "malayalam": "ml", "manipuri": "mni", "marathi": "mr", "nepali": "ne",
    "odia": "or", "punjabi": "pa", "sanskrit": "sa", "santali": "sat", "sindhi": "sd",
    "tamil": "ta", "telugu": "te", "urdu": "ur",
    "spanish": "es", "french": "fr", "german": "de", "portuguese": "pt", "italian": "it",
    "dutch": "nl", "russian": "ru", "ukrainian": "uk", "polish": "pl", "turkish": "tr",
    "arabic": "ar", "persian": "fa", "hebrew": "he", "chinese": "zh", "japanese": "ja",
    "korean": "ko", "thai": "th", "vietnamese": "vi", "indonesian": "id", "malay": "ms",
    "filipino": "fil", "swahili": "sw", "greek": "el", "swedish": "sv", "norwegian": "no",
    "danish": "da", "finnish": "fi", "czech": "cs", "romanian": "ro", "hungarian": "hu",
}

# Approximate fixed exchange rates (units of currency per 1 INR) — used ONLY for display
# conversion and for rolling up admin donation totals into one comparable currency (USD).
# No live payment gateway is wired up yet, so these don't need to track real-time FX rates.
CURRENCY_RATE_PER_INR = {
    "INR": 1, "USD": 0.0121, "EUR": 0.0111, "GBP": 0.0095,
    "AED": 0.0445, "SAR": 0.0453, "QAR": 0.044, "KWD": 0.0037, "OMR": 0.00465, "BHD": 0.00456,
    "CAD": 0.0165, "AUD": 0.0184, "NZD": 0.0202, "SGD": 0.0162,
    "MYR": 0.0537, "IDR": 190.5, "PHP": 0.685, "THB": 0.418, "VND": 305.2,
    "BDT": 1.325, "PKR": 3.36, "LKR": 3.62, "NPR": 1.6, "MMK": 25.4,
    "CNY": 0.0868, "JPY": 1.84, "KRW": 16.4, "HKD": 0.0942, "TWD": 0.373,
    "BRL": 0.0637, "MXN": 0.206, "ARS": 12.1, "CLP": 11.4, "COP": 47.3,
    "ZAR": 0.221, "NGN": 18.9, "KES": 1.56, "EGP": 0.594, "GHS": 0.156, "MAD": 0.121,
    "TZS": 30.7, "UGX": 44.6, "TRY": 0.412, "RUB": 1.09, "UAH": 0.503,
    "PLN": 0.0479, "CZK": 0.276, "HUF": 4.31, "RON": 0.0552, "SEK": 0.128, "NOK": 0.131,
    "DKK": 0.0828, "CHF": 0.0107, "ILS": 0.0446, "IQD": 15.9, "JOD": 0.00858, "LBP": 1080,
    "KZT": 5.86, "UZS": 155, "AZN": 0.0206, "GEL": 0.0327,
}

DEFAULT_APP_CONFIG = {
    "ads_enabled": False,
    "subscriptions_enabled": False,
    # When False (current testing phase) the Community feature is free for everyone.
    # Flip to True from the admin dashboard when Community becomes a premium perk.
    "community_premium_required": False,
    "subscription_prices": {
        "first_month": 29,
        "monthly": 49,
        "6_month": 249,
        "yearly": 399,
    },
    "donations_enabled": False,
    "donation_prices": [101, 201, 501, 1001, 10001, 50001],
}

def to_usd(amount: float, currency_code: str) -> float:
    """Converts an amount in any supported currency to USD using the fixed rate table above,
    with INR as the pivot. Unknown currency codes are treated as already being INR."""
    rate = CURRENCY_RATE_PER_INR.get((currency_code or "INR").upper(), 1.0)
    usd_rate = CURRENCY_RATE_PER_INR["USD"]
    inr_amount = amount / rate if rate else amount
    return round(inr_amount * usd_rate, 2)

# ------------------- Models -------------------
class UserProfile(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    deity_id: Optional[int] = None
    is_public: bool = True
    is_premium: bool = False
    premium_expires_at: Optional[datetime] = None
    affirmation_language: str = "english"
    notification_count: int = 10
    notification_busy_start: Optional[str] = None
    notification_busy_end: Optional[str] = None
    busy_hours_enabled: bool = False
    reminder_mode: str = "random"
    reminder_times: List[str] = []
    wake_alarm_enabled: bool = True
    wake_alarm_time: str = "07:00"
    sleep_alarm_enabled: bool = True
    sleep_alarm_time: str = "22:00"
    # Single, always-free "don't break your streak" daily nudge — separate from the premium
    # per-manifestation Reminder Center above (which supports up to 10x/day + custom scheduling).
    # Defaults to ON for every user (opt-out, not opt-in) so no one silently misses reminders.
    streak_reminder_enabled: bool = True
    streak_reminder_time: str = "20:00"
    onboarding_done: bool = False
    profile_done: bool = False
    tour_done: bool = False
    journey_intro_seen: bool = False
    signin_method: Optional[str] = None
    created_at: datetime

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    deity_id: Optional[int] = None
    country: Optional[str] = None
    is_public: Optional[bool] = None
    affirmation_language: Optional[str] = None
    notification_count: Optional[int] = None
    notification_busy_start: Optional[str] = None
    notification_busy_end: Optional[str] = None
    busy_hours_enabled: Optional[bool] = None
    reminder_mode: Optional[str] = None
    reminder_times: Optional[List[str]] = None
    wake_alarm_enabled: Optional[bool] = None
    wake_alarm_time: Optional[str] = None
    sleep_alarm_enabled: Optional[bool] = None
    sleep_alarm_time: Optional[str] = None
    streak_reminder_enabled: Optional[bool] = None
    streak_reminder_time: Optional[str] = None
    onboarding_done: Optional[bool] = None
    profile_done: Optional[bool] = None
    tour_done: Optional[bool] = None
    journey_intro_seen: Optional[bool] = None

class SessionRequest(BaseModel):
    session_id: str

class GoogleAuthRequest(BaseModel):
    id_token: str

class ManifestationCreate(BaseModel):
    goal_category: str
    goal_custom: Optional[str] = None
    goal_description: Optional[str] = None
    burning_desire: str = Field(min_length=1, max_length=600)
    sacrifice_category: str
    sacrifice_custom: Optional[str] = None
    sacrifice_description: Optional[str] = None
    cycle_days: int
    reminder_count: int = 10
    reminder_mode: str = "random"
    reminder_times: List[str] = []
    affirmation_enabled: bool = False
    affirmation_custom: Optional[str] = None
    fasting_enabled: bool = False
    hustle_enabled: bool = False
    is_public: bool = True
    chandra_dasa_at_start: Optional[str] = None
    cosmic_level_at_start: Optional[int] = None
    moon_phase_at_start: Optional[str] = None

class Manifestation(BaseModel):
    id: str
    user_id: str
    goal_category: str
    goal_custom: Optional[str] = None
    goal_description: Optional[str] = None
    burning_desire: Optional[str] = None
    sacrifice_category: str
    sacrifice_custom: Optional[str] = None
    sacrifice_description: Optional[str] = None
    cycle_days: int
    current_day: int = 0
    streak_count: int = 0
    max_streak: int = 0
    tree_stage: int = 1
    reminder_count: int = 0
    reminder_mode: str = "random"
    reminder_times: List[str] = []
    reminders_ever_enabled: bool = False
    notification_score: int = 0
    notification_streak: int = 0
    notification_last_local_date: Optional[str] = None
    affirmation_enabled: bool = False
    affirmation_custom: Optional[str] = None
    fasting_enabled: bool = False
    hustle_enabled: bool = False
    moon_phase_at_start: Optional[str] = None
    chandra_dasa_at_start: Optional[str] = None
    cosmic_level_at_start: Optional[int] = None
    started_at: datetime
    last_ritual_at: Optional[datetime] = None
    last_ritual_local_date: Optional[str] = None
    last_shown_at: Optional[datetime] = None
    status: str = "active"
    is_public: bool = True
    manifested_at: Optional[datetime] = None
    donated: bool = False
    donation_amount: int = 0
    donation_currency: str = "INR"
    testimony: Optional[str] = None
    deity_id: Optional[int] = None
    user_name: Optional[str] = None
    created_at: datetime

class RitualResult(BaseModel):
    manifestation: Manifestation
    new_stage: bool = False

class ManifestedRequest(BaseModel):
    testimony: Optional[str] = None
    donation_amount: int = 0
    donation_currency: str = "INR"

class RitualRequest(BaseModel):
    local_date: Optional[str] = None

class ReminderUpdate(BaseModel):
    reminder_count: int
    reminder_mode: str = "random"
    reminder_times: List[str] = []

class NotificationResponseRequest(BaseModel):
    event_id: str = Field(min_length=1, max_length=160)
    local_date: str = Field(min_length=8, max_length=16)
    kind: str = Field(default="reminder", max_length=32)

class AdminConfigUpdate(BaseModel):
    ads_enabled: Optional[bool] = None
    subscriptions_enabled: Optional[bool] = None
    community_premium_required: Optional[bool] = None
    donations_enabled: Optional[bool] = None
    subscription_prices: Optional[dict[str, int]] = None
    donation_prices: Optional[List[int]] = None

class SubscribeRequest(BaseModel):
    plan: Literal["first_month", "monthly", "6_month", "yearly"]

class AdminUserUpdate(BaseModel):
    is_premium: Optional[bool] = None
    is_public: Optional[bool] = None
    name: Optional[str] = None

class BlockUserRequest(BaseModel):
    days: Optional[int] = None  # None/omitted = permanent block

class ExtendPremiumRequest(BaseModel):
    days: int

class TicketAttachment(BaseModel):
    filename: str
    mime_type: str
    data_base64: str  # raw base64 payload, no "data:" URI prefix (added client-side on render)

class TicketCreate(BaseModel):
    subject: str
    description: str
    attachments: List[TicketAttachment] = []

class TicketReplyRequest(BaseModel):
    reply: str

# ------------------- Admin -------------------
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
# Simple shared password for the web admin dashboard (set in backend/.env).
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_SESSION_TTL_SECONDS = 12 * 3600

# Web OAuth Client ID from the developer's own Google Cloud project — used as the required
# `audience` when verifying native Google Sign-In ID tokens below (the Android client is
# matched by Google automatically via package name + SHA-1, it's never referenced in code).
GOOGLE_WEB_CLIENT_ID = os.environ.get("GOOGLE_WEB_CLIENT_ID", "")

# ------------------- Helpers -------------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires = session.get("expires_at")
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Enforce admin-issued block (temporary or permanent). Temporary blocks auto-expire.
    if user.get("is_blocked"):
        until = user.get("blocked_until")
        if until:
            if until.tzinfo is None:
                until = until.replace(tzinfo=timezone.utc)
            if until < datetime.now(timezone.utc):
                await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"is_blocked": False, "blocked_until": None}})
                user["is_blocked"] = False
                user["blocked_until"] = None
            else:
                raise HTTPException(status_code=403, detail="Your account has been temporarily blocked. Contact support.")
        else:
            raise HTTPException(status_code=403, detail="Your account has been blocked. Contact support.")
    # Downgrade premium if expired
    if user.get("is_premium") and user.get("premium_expires_at"):
        exp = user["premium_expires_at"]
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"is_premium": False}})
            user["is_premium"] = False
    return user

def clean_user(u: dict) -> dict:
    d = {k: v for k, v in u.items() if k != "_id"}
    d.setdefault("notification_count", 10)
    d.setdefault("reminder_mode", "random")
    d.setdefault("reminder_times", [])
    d.setdefault("wake_alarm_enabled", True)
    d.setdefault("wake_alarm_time", "07:00")
    d.setdefault("sleep_alarm_enabled", True)
    d.setdefault("sleep_alarm_time", "22:00")
    d["is_admin"] = d.get("email", "").lower() in ADMIN_EMAILS
    return d

async def get_app_config() -> dict:
    stored = await db.app_config.find_one({"key": "global"}, {"_id": 0}) or {}
    config = {**DEFAULT_APP_CONFIG, **{k: v for k, v in stored.items() if k != "key"}}
    config["subscription_prices"] = {
        **DEFAULT_APP_CONFIG["subscription_prices"],
        **config.get("subscription_prices", {}),
    }
    return config

def _heal_max_streak(m: dict) -> tuple[dict, bool]:
    """Self-heals the 'personal best' field: max_streak must never read lower than the
    current streak_count (this was the root cause of the 'Best 0' display bug — legacy
    manifestation docs written before max_streak was tracked, or created by an older
    build, could persist max_streak=0/missing while streak_count kept climbing). Returns
    the (possibly corrected) doc and whether a correction was made, so callers can decide
    whether to persist the fix back to Mongo."""
    if not m:
        return m, False
    streak = m.get("streak_count") or 0
    best = m.get("max_streak") or 0
    if best < streak:
        m["max_streak"] = streak
        return m, True
    return m, False

async def heal_manifestation(m: dict) -> dict:
    """Heals a single manifestation dict and persists the correction if one was needed."""
    m, changed = _heal_max_streak(m)
    if changed and m.get("id"):
        await db.manifestations.update_one({"id": m["id"]}, {"$set": {"max_streak": m["max_streak"]}})
    return m

async def heal_manifestations(items: list) -> list:
    """Heals a list of manifestation dicts (community wall, leaderboard, saved, garden) and
    persists any corrections in a single batch update."""
    to_fix = []
    for m in items:
        _, changed = _heal_max_streak(m)
        if changed and m.get("id"):
            to_fix.append(m["id"])
    if to_fix:
        # Each doc may have a different corrected value, so update individually — the list is
        # always small (<=50) so this stays cheap and avoids a fragile bulk-write pipeline.
        for m in items:
            if m.get("id") in to_fix:
                await db.manifestations.update_one({"id": m["id"]}, {"$set": {"max_streak": m["max_streak"]}})
    return items

async def get_current_admin(authorization: Optional[str] = Header(None)) -> dict:
    """Admin auth for the web dashboard: accepts an admin-password session token
    (issued by POST /admin/login) or, as a fallback, a normal user session that
    belongs to an ADMIN_EMAILS account."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        sess = await db.admin_sessions.find_one(
            {"token_hash": sha256(token.encode("utf-8")).hexdigest(), "kind": "admin"}, {"_id": 0}
        )
        if sess:
            exp = sess.get("expires_at")
            if exp and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp and exp > datetime.now(timezone.utc):
                return {"email": "admin@dashboard", "is_admin": True, "user_id": "admin-dashboard"}
    user = await get_current_user(authorization)
    if user.get("email", "").lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

class AdminLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=1024)

@api_router.post("/admin/login")
async def admin_login(req: AdminLoginRequest):
    if not ADMIN_PASSWORD or not hmac.compare_digest(req.password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid password")
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.admin_sessions.insert_one({
        "token_hash": sha256(raw_token.encode("utf-8")).hexdigest(),
        "kind": "admin",
        "created_at": now,
        "expires_at": now + timedelta(seconds=ADMIN_SESSION_TTL_SECONDS),
    })
    return {"access_token": raw_token, "token_type": "bearer", "expires_in": ADMIN_SESSION_TTL_SECONDS}

# ------------------- Startup -------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.manifestations.create_index("user_id")
    await db.manifestations.create_index("is_public")
    await db.manifestations.create_index("status")
    await db.manifestations.create_index("last_shown_at")
    await db.tickets.create_index("user_id")
    await db.tickets.create_index("status")
    await db.notifications.create_index("user_id")
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    await db.notification_responses.create_index([("user_id", 1), ("event_id", 1)], unique=True)
    await db.app_config.create_index("key", unique=True)
    await db.admin_sessions.create_index("token_hash", unique=True)
    await db.admin_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.app_config.update_one(
        {"key": "global"},
        {"$setOnInsert": {"key": "global", **DEFAULT_APP_CONFIG}},
        upsert=True,
    )

# ------------------- Auth Routes -------------------
@api_router.post("/auth/dev-login")
async def dev_login(email: str = "test@mtree.dev", name: str = "Test User"):
    """DEV-ONLY endpoint: create/fetch a user and issue a session_token without Google OAuth.
    Used only for automated testing. Disabled by default in production — requires
    ENABLE_DEV_LOGIN=true env var AND the email must be on the internal @mtree.dev test
    domain, so it can never be used to take over a real user's Google-signed-in account."""
    if os.environ.get("ENABLE_DEV_LOGIN", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Not found")
    if not email.endswith("@mtree.dev"):
        raise HTTPException(status_code=403, detail="dev-login is restricted to @mtree.dev test emails")

    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": None,
            "gender": None, "dob": None, "deity_id": None,
            "is_public": True, "is_premium": False, "premium_expires_at": None,
            "affirmation_language": "english", "notification_count": 10,
            "notification_busy_start": None, "notification_busy_end": None,
            "busy_hours_enabled": False,
            "reminder_mode": "random", "reminder_times": [],
            "wake_alarm_enabled": True, "wake_alarm_time": "07:00",
            "sleep_alarm_enabled": True, "sleep_alarm_time": "22:00",
            "streak_reminder_enabled": True,
            "streak_reminder_time": "20:00",
            "onboarding_done": False, "profile_done": False, "tour_done": False,
            "journey_intro_seen": False,
            "signin_method": "dev_login",
            "created_at": now,
        })
    session_token = f"devtok_{secrets.token_urlsafe(32)}"
    await db.user_sessions.insert_one({
        "session_token": session_token, "user_id": user_id,
        "created_at": now, "expires_at": now + timedelta(days=7),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": clean_user(user)}

@api_router.post("/auth/session")
async def auth_session(req: SessionRequest):
    """Exchange session_id from Emergent auth for a session_token, upsert user."""
    async with httpx.AsyncClient(timeout=15.0) as client_http:
        r = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()
    email = data.get("email")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=400, detail="Malformed session data")

    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "gender": None,
            "dob": None,
            "deity_id": None,
            "is_public": True,
            "is_premium": False,
            "premium_expires_at": None,
            "affirmation_language": "english",
            "notification_count": 10,
            "notification_busy_start": None,
            "notification_busy_end": None,
            "busy_hours_enabled": False,
            "reminder_mode": "random",
            "reminder_times": [],
            "wake_alarm_enabled": True,
            "wake_alarm_time": "07:00",
            "sleep_alarm_enabled": True,
            "sleep_alarm_time": "22:00",
            "streak_reminder_enabled": True,
            "streak_reminder_time": "20:00",
            "onboarding_done": False,
            "profile_done": False,
            "tour_done": False,
            "journey_intro_seen": False,
            "signin_method": "google_web",
            "created_at": now,
        }
        await db.users.insert_one(new_user)

    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": now,
            "expires_at": now + timedelta(days=7),
        }},
        upsert=True,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": clean_user(user)}

@api_router.post("/auth/google")
async def auth_google(req: GoogleAuthRequest):
    """Native 1-tap Google Sign-In (developer's own Google Cloud OAuth credentials, via
    @react-native-google-signin/google-signin) — verifies the ID token server-side against
    GOOGLE_WEB_CLIENT_ID (aud/iss/exp all checked by google-auth), then upserts/logs in the
    user the same way /auth/session does for the Emergent-managed browser flow, so both auth
    paths share one user/session model."""
    if not GOOGLE_WEB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google Sign-In not configured")
    try:
        claims = google_id_token.verify_oauth2_token(
            req.id_token, google_requests.Request(), GOOGLE_WEB_CLIENT_ID,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google ID token")

    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    name = claims.get("name") or email.split("@")[0]
    picture = claims.get("picture")

    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "gender": None,
            "dob": None,
            "deity_id": None,
            "is_public": True,
            "is_premium": False,
            "premium_expires_at": None,
            "affirmation_language": "english",
            "notification_count": 10,
            "notification_busy_start": None,
            "notification_busy_end": None,
            "busy_hours_enabled": False,
            "reminder_mode": "random",
            "reminder_times": [],
            "wake_alarm_enabled": True,
            "wake_alarm_time": "07:00",
            "sleep_alarm_enabled": True,
            "sleep_alarm_time": "22:00",
            "streak_reminder_enabled": True,
            "streak_reminder_time": "20:00",
            "onboarding_done": False,
            "profile_done": False,
            "tour_done": False,
            "journey_intro_seen": False,
            "signin_method": "google_native",
            "created_at": now,
        })


    session_token = f"gtok_{secrets.token_urlsafe(32)}"
    await db.user_sessions.insert_one({
        "session_token": session_token, "user_id": user_id,
        "created_at": now, "expires_at": now + timedelta(days=7),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": clean_user(user)}


@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return clean_user(user)

@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authorization[7:]})
    return {"ok": True}

@api_router.delete("/account")
async def delete_account(user: dict = Depends(get_current_user)):
    """Permanently deletes the user's account and all associated data (Google Play account-deletion requirement)."""
    uid = user["user_id"]
    manifestation_ids = [m["id"] for m in await db.manifestations.find({"user_id": uid}, {"_id": 0, "id": 1}).to_list(1000)]
    await db.manifestations.delete_many({"user_id": uid})
    await db.garden.delete_many({"user_id": uid})
    await db.saved_manifestations.delete_many({"user_id": uid})
    if manifestation_ids:
        await db.saved_manifestations.delete_many({"manifestation_id": {"$in": manifestation_ids}})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}

# ------------------- Profile -------------------
@api_router.patch("/profile")
async def update_profile(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        if updates.get("deity_id") is not None:
            await db.manifestations.update_many(
                {"user_id": user["user_id"], "status": "active", "deity_id": None},
                {"$set": {"deity_id": updates["deity_id"]}},
            )
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return clean_user(updated)

# ------------------- Static data -------------------
@api_router.get("/deities")
async def get_deities():
    return DEITIES

@api_router.get("/chandra-dasa/today")
async def chandra_dasa_today():
    today = datetime.now(timezone.utc)
    day_of_year = today.timetuple().tm_yday
    day_number = (day_of_year % 30) + 1
    entry = next((c for c in CHANDRA_DASA if c["day_number"] == day_number), CHANDRA_DASA[0])
    return entry

@api_router.get("/affirmations/{category}")
async def get_affirmation(category: str, language: str = "english"):
    lookup_category = CATEGORY_ALIASES.get(category, category)
    lang_code = LANGUAGE_CODE_MAP.get(language, "en")
    per_lang = AFFIRMATIONS_I18N.get(lookup_category)

    if per_lang:
        resolved_category = category
        text = per_lang.get(lang_code) or per_lang.get("en") or AFFIRMATIONS["custom"]
        text_english = per_lang.get("en") or text
    else:
        # Category has no curated multi-language data (e.g. "custom") — fall back to the
        # static English-only text.
        resolved_category = "custom"
        text = AFFIRMATIONS["custom"]
        text_english = text

    return {
        "goal_category": resolved_category,
        "language": language,
        "text": text,
        "text_english": text_english,
    }

@api_router.get("/ui-strings")
async def get_ui_strings(language: str = "english"):
    """Fixed, short ritual/notification UI phrases (sacrifice chant template, chant
    instructions, "take deep breaths", etc.) in the requested language. {{SACRIFICE}}/{{GOAL}}
    tokens inside "sacrifice_template" are returned literally — the frontend substitutes them
    with the user's actual sacrifice/goal category names."""
    lang_code = LANGUAGE_CODE_MAP.get(language, "en")
    result = {}
    for key, per_lang in UI_STRINGS_I18N.items():
        result[key] = per_lang.get(lang_code) or per_lang.get("en") or ""
    return {"language": language, "strings": result}

@api_router.get("/category-labels")
async def get_category_labels(language: str = "english"):
    """All Goal/Sacrifice category label translations (keyed by category `key`) in the
    requested language — e.g. {"money": "धन", "junk_food": "जंक फूड", ...} for Hindi. Falls
    back to the English label for any key missing a translation."""
    lang_code = LANGUAGE_CODE_MAP.get(language, "en")
    result = {}
    for key, per_lang in CATEGORY_LABELS_I18N.items():
        result[key] = per_lang.get(lang_code) or per_lang.get("en") or ""
    return {"language": language, "labels": result}

# ------------------- Subscriptions (Stubbed) -------------------
@api_router.get("/app-config")
async def app_config(user: dict = Depends(get_current_user)):
    return await get_app_config()

@api_router.post("/subscribe")
async def subscribe(req: SubscribeRequest, user: dict = Depends(get_current_user)):
    """Placeholder entry point. Real Google Play Billing is intentionally not active yet."""
    config = await get_app_config()
    if not config.get("subscriptions_enabled"):
        raise HTTPException(status_code=503, detail="Subscriptions are not available yet")
    duration = {
        "first_month": 30, "monthly": 30, "6_month": 180, "yearly": 365
    }[req.plan]
    amount = int(config["subscription_prices"][req.plan])
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=duration)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_premium": True, "premium_expires_at": expires}},
    )
    sub = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "plan": req.plan,
        "amount_inr": amount,
        "started_at": now,
        "expires_at": expires,
        "status": "active",
        "created_at": now,
    }
    await db.subscriptions.insert_one(sub)
    return {"is_premium": True, "expires_at": expires.isoformat(), "plan": req.plan}

# ------------------- Manifestations -------------------
@api_router.post("/manifestations")
async def create_manifestation(req: ManifestationCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    # Abandon any active manifestation
    await db.manifestations.update_many(
        {"user_id": user["user_id"], "status": "active"},
        {"$set": {"status": "abandoned"}},
    )
    m = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "user_name": user.get("name"),
        "deity_id": user.get("deity_id"),
        **req.dict(),
        "current_day": 0,
        "streak_count": 0,
        "max_streak": 0,
        "tree_stage": 1,
        "reminders_ever_enabled": req.reminder_count > 0,
        "notification_score": 0,
        "notification_streak": 0,
        "notification_last_local_date": None,
        "started_at": now,
        "last_ritual_at": None,
        "status": "active",
        "manifested_at": None,
        "donated": False,
        "donation_amount": 0,
        "testimony": None,
        "created_at": now,
    }
    # Internal @mtree.dev test/dev-login accounts must never surface on the public Community
    # Wall or leaderboard, no matter what the client requests — keeps production social
    # features showing only real users.
    if (user.get("email") or "").lower().endswith("@mtree.dev"):
        m["is_public"] = False
    await db.manifestations.insert_one(m)
    return clean_user(m)

@api_router.get("/manifestations/active")
async def get_active(user: dict = Depends(get_current_user)):
    m = await db.manifestations.find_one(
        {"user_id": user["user_id"], "status": "active"}, {"_id": 0}
    )
    if m:
        m = await heal_manifestation(m)
    return m

@api_router.post("/manifestations/{mid}/ritual")
async def perform_ritual(mid: str, req: RitualRequest = RitualRequest(), user: dict = Depends(get_current_user)):
    m = await db.manifestations.find_one({"id": mid, "user_id": user["user_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Manifestation not found")
    now = datetime.now(timezone.utc)
    # Check if already done today. Prefer the client's local calendar date (avoids UTC vs
    # user-timezone day-boundary mismatches); fall back to UTC date comparison for old clients.
    prev_local = m.get("last_ritual_local_date")
    if req.local_date:
        if prev_local == req.local_date:
            raise HTTPException(400, "Already performed today")
    else:
        last = m.get("last_ritual_at")
        if last:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if last.date() == now.date():
                raise HTTPException(400, "Already performed today")
    # Determine whether today continues the streak (performed on the very next calendar day)
    # or breaks it (a full day or more was missed) — a gap of exactly 1 day continues the
    # streak, no previous ritual at all starts a fresh streak, and any larger gap resets it
    # back to 1. current_day (total days completed) always increments regardless — it tracks
    # lifetime rituals performed, not the consecutive streak.
    streak_continues = True
    if req.local_date:
        if prev_local:
            try:
                prev_date = datetime.strptime(prev_local, "%Y-%m-%d").date()
                curr_date = datetime.strptime(req.local_date, "%Y-%m-%d").date()
                streak_continues = (curr_date - prev_date).days == 1
            except ValueError:
                streak_continues = True  # malformed date — don't punish the user for it
    else:
        last = m.get("last_ritual_at")
        if last:
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            streak_continues = (now.date() - last.date()).days == 1
    # Increment day, streak
    new_day = m.get("current_day", 0) + 1
    new_streak = (m.get("streak_count", 0) + 1) if streak_continues else 1
    max_streak = max(m.get("max_streak", 0), new_streak)
    # Compute new stage
    days_per_stage = max(1, (m["cycle_days"] + 4) // 5)
    new_stage = min(5, (new_day // days_per_stage) + 1)
    is_new_stage = new_stage > m["tree_stage"]
    updates = {
        "current_day": new_day,
        "streak_count": new_streak,
        "max_streak": max_streak,
        "tree_stage": new_stage,
        "last_ritual_at": now,
        "last_ritual_local_date": req.local_date,
    }
    await db.manifestations.update_one({"id": mid}, {"$set": updates})
    await db.daily_rituals.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "manifestation_id": mid,
        "day_number": new_day,
        "performed_at": now,
        # Stored alongside the UTC timestamp so the streak calendar (frontend) can render an
        # accurate completed-vs-missed grid using the SAME calendar-day boundaries the streak
        # logic itself uses, instead of re-deriving (and potentially mis-deriving, across a
        # timezone boundary) a date from performed_at.
        "local_date": req.local_date,
    })
    updated = await db.manifestations.find_one({"id": mid}, {"_id": 0})
    return {"manifestation": updated, "new_stage": is_new_stage, "streak_continued": streak_continues}

@api_router.get("/manifestations/{mid}/ritual-history")
async def get_ritual_history(mid: str, user: dict = Depends(get_current_user)):
    """Returns every completed ritual's day number + local calendar date for this
    manifestation, powering the graphical streak calendar/timeline in the app (which days
    were completed vs. missed). Older entries recorded before local_date tracking existed
    fall back to a date derived from their UTC performed_at timestamp."""
    m = await db.manifestations.find_one({"id": mid, "user_id": user["user_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Manifestation not found")
    cursor = db.daily_rituals.find(
        {"manifestation_id": mid, "user_id": user["user_id"]},
        {"_id": 0, "day_number": 1, "local_date": 1, "performed_at": 1},
    ).sort("day_number", 1)
    rituals = await cursor.to_list(length=1000)
    for r in rituals:
        if not r.get("local_date") and r.get("performed_at"):
            pa = r["performed_at"]
            if isinstance(pa, datetime):
                r["local_date"] = pa.strftime("%Y-%m-%d")
        r.pop("performed_at", None)
    return {"rituals": rituals}



@api_router.post("/manifestations/{mid}/manifested")
async def mark_manifested(mid: str, req: ManifestedRequest, user: dict = Depends(get_current_user)):
    m = await db.manifestations.find_one({"id": mid, "user_id": user["user_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Manifestation not found")
    now = datetime.now(timezone.utc)
    updates = {
        "status": "manifested",
        "manifested_at": now,
        "testimony": req.testimony,
        "donated": req.donation_amount > 0,
        "donation_amount": req.donation_amount,
        "donation_currency": req.donation_currency,
    }
    await db.manifestations.update_one({"id": mid}, {"$set": updates})
    # Add to garden
    await db.garden.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "manifestation_id": mid,
        "testimony": req.testimony,
        "achieved_at": now,
    })
    updated = await db.manifestations.find_one({"id": mid}, {"_id": 0})
    updated = await heal_manifestation(updated)
    return updated

@api_router.post("/manifestations/{mid}/abandon")
async def abandon(mid: str, user: dict = Depends(get_current_user)):
    await db.manifestations.update_one(
        {"id": mid, "user_id": user["user_id"]},
        {"$set": {"status": "abandoned"}},
    )
    return {"ok": True}

@api_router.patch("/manifestations/{mid}/reminders")
async def update_reminders(mid: str, req: ReminderUpdate, user: dict = Depends(get_current_user)):
    """Quick-access reminder center — updates reminder_count/mode/times on an active
    manifestation, without needing to abandon/recreate it. `reminders_ever_enabled` is sticky:
    once reminders have been turned on at least once (at setup or later), the Home bell icon
    stays visible forever for this manifestation, only its active/muted appearance changes."""
    m = await db.manifestations.find_one({"id": mid, "user_id": user["user_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Manifestation not found")
    count = max(0, min(10, req.reminder_count))
    ever_enabled = bool(m.get("reminders_ever_enabled")) or count > 0
    await db.manifestations.update_one(
        {"id": mid},
        {"$set": {
            "reminder_count": count,
            "reminder_mode": req.reminder_mode,
            "reminder_times": req.reminder_times,
            "reminders_ever_enabled": ever_enabled,
        }},
    )
    updated = await db.manifestations.find_one({"id": mid}, {"_id": 0})
    return clean_user(updated)

@api_router.post("/manifestations/{mid}/notification-response")
async def record_notification_response(
    mid: str,
    req: NotificationResponseRequest,
    user: dict = Depends(get_current_user),
):
    m = await db.manifestations.find_one(
        {"id": mid, "user_id": user["user_id"], "status": "active"}, {"_id": 0}
    )
    if not m:
        raise HTTPException(404, "Active manifestation not found")
    now = datetime.now(timezone.utc)
    response = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "manifestation_id": mid,
        "event_id": req.event_id,
        "kind": req.kind,
        "local_date": req.local_date,
        "created_at": now,
    }
    try:
        await db.notification_responses.insert_one(response)
    except Exception as exc:
        if "duplicate key" not in str(exc).lower() and "e11000" not in str(exc).lower():
            raise
        current = await db.manifestations.find_one({"id": mid}, {"_id": 0})
        return {
            "recorded": False,
            "notification_score": current.get("notification_score", 0),
            "notification_streak": current.get("notification_streak", 0),
            "target": current.get("cycle_days", 0) * current.get("reminder_count", 0),
        }

    previous_date = m.get("notification_last_local_date")
    streak = m.get("notification_streak", 0)
    if previous_date != req.local_date:
        try:
            previous = datetime.strptime(previous_date, "%Y-%m-%d").date() if previous_date else None
            current_date = datetime.strptime(req.local_date, "%Y-%m-%d").date()
            streak = streak + 1 if previous and (current_date - previous).days == 1 else 1
        except ValueError:
            streak = max(1, streak)
    await db.manifestations.update_one(
        {"id": mid},
        {
            "$inc": {"notification_score": 1},
            "$set": {"notification_streak": streak, "notification_last_local_date": req.local_date},
        },
    )
    updated = await db.manifestations.find_one({"id": mid}, {"_id": 0})
    return {
        "recorded": True,
        "notification_score": updated.get("notification_score", 0),
        "notification_streak": updated.get("notification_streak", 0),
        "target": updated.get("cycle_days", 0) * updated.get("reminder_count", 0),
    }

# ------------------- Garden -------------------
@api_router.get("/garden")
async def get_garden(user: dict = Depends(get_current_user)):
    items = await db.garden.find({"user_id": user["user_id"]}, {"_id": 0}).sort("achieved_at", -1).to_list(200)
    # enrich with manifestation details (single batch query instead of N+1)
    mids = [g["manifestation_id"] for g in items]
    manifestations = await db.manifestations.find({"id": {"$in": mids}}, {"_id": 0}).to_list(len(mids))
    m_by_id = {m["id"]: m for m in manifestations}
    result = [{**g, "manifestation": m_by_id[g["manifestation_id"]]} for g in items if g["manifestation_id"] in m_by_id]
    await heal_manifestations([r["manifestation"] for r in result])
    return result

# ------------------- Community Wall -------------------
async def _test_account_user_ids() -> List[str]:
    """Resolves current @mtree.dev test/dev-login account user_ids, so wall/leaderboard
    queries can exclude them as defense-in-depth (on top of forcing is_public=False for
    these accounts at manifestation-creation time)."""
    docs = await db.users.find({"email": {"$regex": "@mtree\\.dev$", "$options": "i"}}, {"_id": 0, "user_id": 1}).to_list(1000)
    return [d["user_id"] for d in docs]

async def sanitize_community_manifestations(items: list[dict]) -> list[dict]:
    """Adds safe engagement summaries while removing private or timing-specific fields."""
    user_ids = list({item.get("user_id") for item in items if item.get("user_id")})
    users = await db.users.find(
        {"user_id": {"$in": user_ids}},
        {
            "_id": 0,
            "user_id": 1,
            "wake_alarm_enabled": 1,
            "sleep_alarm_enabled": 1,
        },
    ).to_list(len(user_ids)) if user_ids else []
    user_map = {u["user_id"]: u for u in users}
    private_fields = {
        "burning_desire", "goal_description", "sacrifice_description",
        "reminder_times", "last_ritual_local_date", "notification_last_local_date",
    }
    safe_items = []
    for original in items:
        item = {k: v for k, v in original.items() if k not in private_fields and k != "_id"}
        owner = user_map.get(item.get("user_id"), {})
        item["wake_alarm_enabled"] = owner.get("wake_alarm_enabled", True)
        item["sleep_alarm_enabled"] = owner.get("sleep_alarm_enabled", True)
        item["notification_score"] = item.get("notification_score", 0)
        item["notification_target"] = item.get("cycle_days", 0) * item.get("reminder_count", 0)
        safe_items.append(item)
    return safe_items

@api_router.get("/community/wall")
async def wall(
    user: dict = Depends(get_current_user),
    goal_category: Optional[str] = None,
    sacrifice_category: Optional[str] = None,
    cycle_days: Optional[int] = None,
    fasting_enabled: Optional[bool] = None,
    limit: int = 20,
):
    config = await get_app_config()
    if config.get("community_premium_required") and not user.get("is_premium"):
        raise HTTPException(403, "Premium required")
    limit = max(1, min(50, limit))
    # Only completed manifestations are shown on the wall (showcase of successes). Test/
    # dev-login accounts are always excluded so the production wall only shows real users.
    test_ids = await _test_account_user_ids()
    query: dict = {"is_public": True, "status": "manifested", "user_id": {"$nin": test_ids}}
    if goal_category:
        query["goal_category"] = goal_category
    if sacrifice_category:
        query["sacrifice_category"] = sacrifice_category
    if cycle_days:
        query["cycle_days"] = cycle_days
    if fasting_enabled is not None:
        query["fasting_enabled"] = fasting_enabled

    # Fair rotation: entries never shown (missing last_shown_at) sort first, then the
    # least-recently-shown ones — so every completed manifestation gets a turn, and if
    # there aren't enough fresh ones the oldest-shown entries are naturally reused.
    items = await db.manifestations.find(query, {"_id": 0}).sort(
        [("last_shown_at", 1), ("manifested_at", -1)]
    ).limit(limit).to_list(limit)

    if items:
        now = datetime.now(timezone.utc)
        ids = [i["id"] for i in items]
        await db.manifestations.update_many({"id": {"$in": ids}}, {"$set": {"last_shown_at": now}})
    items = await heal_manifestations(items)
    return await sanitize_community_manifestations(items)

@api_router.get("/community/leaderboard")
async def leaderboard(user: dict = Depends(get_current_user)):
    config = await get_app_config()
    if config.get("community_premium_required") and not user.get("is_premium"):
        raise HTTPException(403, "Premium required")
    test_ids = await _test_account_user_ids()
    items = await db.manifestations.find(
        {"is_public": True, "user_id": {"$nin": test_ids}}, {"_id": 0}
    ).sort("max_streak", -1).limit(50).to_list(50)
    items = await heal_manifestations(items)
    return await sanitize_community_manifestations(items)

@api_router.post("/community/save/{mid}")
async def save_manifestation(mid: str, user: dict = Depends(get_current_user)):
    config = await get_app_config()
    if config.get("community_premium_required") and not user.get("is_premium"):
        raise HTTPException(403, "Premium required")
    existing = await db.saved_manifestations.find_one(
        {"user_id": user["user_id"], "manifestation_id": mid}
    )
    if existing:
        await db.saved_manifestations.delete_one({"_id": existing["_id"]})
        return {"saved": False}
    now = datetime.now(timezone.utc)
    await db.saved_manifestations.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["user_id"],
        "manifestation_id": mid, "saved_at": now,
    })
    return {"saved": True}

@api_router.get("/community/saved")
async def get_saved(user: dict = Depends(get_current_user)):
    saved = await db.saved_manifestations.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    mids = [s["manifestation_id"] for s in saved]
    result = await db.manifestations.find({"id": {"$in": mids}}, {"_id": 0}).to_list(len(mids))
    result = await heal_manifestations(result)
    return await sanitize_community_manifestations(result)

# ------------------- Support Tickets -------------------
MAX_TICKET_ATTACHMENTS = 3

@api_router.post("/tickets")
async def create_ticket(req: TicketCreate, user: dict = Depends(get_current_user)):
    subject = req.subject.strip()
    description = req.description.strip()
    if not subject or not description:
        raise HTTPException(400, "Subject and description are required")
    if len(req.attachments) > MAX_TICKET_ATTACHMENTS:
        raise HTTPException(400, f"Maximum {MAX_TICKET_ATTACHMENTS} attachments allowed")
    now = datetime.now(timezone.utc)
    t = {
        "id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "subject": subject[:200],
        "description": description[:5000],
        "attachments": [a.dict() for a in req.attachments],
        "status": "open",
        "admin_reply": None,
        "admin_replied_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.tickets.insert_one(t)
    t.pop("_id", None)
    return t

@api_router.get("/tickets")
async def list_my_tickets(user: dict = Depends(get_current_user)):
    # Attachments (base64) excluded from the list view to keep the payload light — fetched
    # in full only when a single ticket's detail is opened.
    items = await db.tickets.find(
        {"user_id": user["user_id"]}, {"_id": 0, "attachments": 0}
    ).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/tickets/{tid}")
async def get_my_ticket(tid: str, user: dict = Depends(get_current_user)):
    t = await db.tickets.find_one({"id": tid, "user_id": user["user_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    return t

# ------------------- Notifications (in-app only) -------------------
@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items

@api_router.get("/notifications/unread-count")
async def notifications_unread_count(user: dict = Depends(get_current_user)):
    n = await db.notifications.count_documents({"user_id": user["user_id"], "is_read": False})
    return {"count": n}

@api_router.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["user_id"]}, {"$set": {"is_read": True}})
    return {"ok": True}

@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "is_read": False}, {"$set": {"is_read": True}})
    return {"ok": True}

# ------------------- Admin API -------------------
@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_current_admin)):
    test_ids = await _test_account_user_ids()
    real_users = {"user_id": {"$nin": test_ids}, "email": {"$nin": list(ADMIN_EMAILS)}}
    total_users = await db.users.count_documents(real_users)
    premium_users = await db.users.count_documents({**real_users, "is_premium": True})
    total_manifestations = await db.manifestations.count_documents({})
    active_manifestations = await db.manifestations.count_documents({"status": "active"})
    completed_manifestations = await db.manifestations.count_documents({"status": "manifested"})
    wall_posts = await db.manifestations.count_documents({"status": "manifested", "is_public": True})
    open_tickets = await db.tickets.count_documents({"status": {"$in": ["open", "replied"]}, "user_id": {"$nin": test_ids}})
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "total_manifestations": total_manifestations,
        "active_manifestations": active_manifestations,
        "completed_manifestations": completed_manifestations,
        "wall_posts": wall_posts,
        "open_tickets": open_tickets,
    }

@api_router.get("/admin/users")
async def admin_list_users(
    admin: dict = Depends(get_current_admin),
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    # Admin accounts are excluded from the manageable users list — they're not "normal" users
    # and should never be at risk of accidental block/delete from this screen.
    test_ids = await _test_account_user_ids()
    query: dict = {"email": {"$nin": list(ADMIN_EMAILS)}, "user_id": {"$nin": test_ids}}
    if search:
        query["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
        ]
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "users": [clean_user(u) for u in users]}

async def _get_target_user_or_404(user_id: str) -> dict:
    """Fetches a user by id and blocks any mutating admin action against another admin
    account — defense in depth even if the frontend somehow sent an admin's user_id."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.get("email", "").lower() in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="Cannot perform this action on an admin account")
    return u

@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, admin: dict = Depends(get_current_admin)):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    manifestations = await db.manifestations.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    total_donated_usd = round(sum(
        to_usd(m.get("donation_amount", 0), m.get("donation_currency", "INR"))
        for m in manifestations if m.get("donated")
    ), 2)
    tickets = await db.tickets.find(
        {"user_id": user_id}, {"_id": 0, "attachments": 0}
    ).sort("created_at", -1).to_list(200)
    active_ticket = next((t for t in tickets if t.get("status") in {"open", "replied"}), None)
    ticket_history = [t for t in tickets if not active_ticket or t.get("id") != active_ticket.get("id")]
    return {
        "user": clean_user(u),
        "manifestations": manifestations,
        "total_donated_usd": total_donated_usd,
        "current_ticket": active_ticket,
        "ticket_history": ticket_history,
    }

@api_router.get("/admin/config")
async def admin_get_config(admin: dict = Depends(get_current_admin)):
    return await get_app_config()

@api_router.patch("/admin/config")
async def admin_update_config(req: AdminConfigUpdate, admin: dict = Depends(get_current_admin)):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if "subscription_prices" in updates:
        updates["subscription_prices"] = {
            key: max(1, int(value)) for key, value in updates["subscription_prices"].items()
            if key in DEFAULT_APP_CONFIG["subscription_prices"]
        }
    if "donation_prices" in updates:
        updates["donation_prices"] = sorted({max(1, int(value)) for value in updates["donation_prices"]})
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.app_config.update_one({"key": "global"}, {"$set": updates}, upsert=True)
    return await get_app_config()

@api_router.get("/admin-dashboard", response_class=HTMLResponse)
async def admin_dashboard_page():
    html_path = ROOT_DIR / "admin_dashboard.html"
    if not html_path.exists():
        raise HTTPException(404, "Admin dashboard not found")
    html = html_path.read_text(encoding="utf-8")
    return HTMLResponse(html.replace("{{GOOGLE_WEB_CLIENT_ID}}", GOOGLE_WEB_CLIENT_ID))

@api_router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, req: AdminUserUpdate, admin: dict = Depends(get_current_admin)):
    await _get_target_user_or_404(user_id)
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(u)

@api_router.post("/admin/users/{user_id}/block")
async def admin_block_user(user_id: str, req: BlockUserRequest, admin: dict = Depends(get_current_admin)):
    """Blocks a user's access — temporarily (req.days) or permanently (days omitted).
    Existing sessions are checked against this on every request (get_current_user), so the
    block takes effect immediately without needing to log the user out."""
    await _get_target_user_or_404(user_id)
    blocked_until = datetime.now(timezone.utc) + timedelta(days=req.days) if req.days else None
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_blocked": True, "blocked_until": blocked_until}},
    )
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(u)

@api_router.post("/admin/users/{user_id}/unblock")
async def admin_unblock_user(user_id: str, admin: dict = Depends(get_current_admin)):
    await _get_target_user_or_404(user_id)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_blocked": False, "blocked_until": None}},
    )
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(u)

@api_router.post("/admin/users/{user_id}/extend-premium")
async def admin_extend_premium(user_id: str, req: ExtendPremiumRequest, admin: dict = Depends(get_current_admin)):
    """Grants/extends premium by req.days — stacks on top of a still-active expiry, otherwise
    starts counting from now."""
    u = await _get_target_user_or_404(user_id)
    now = datetime.now(timezone.utc)
    current_expiry = u.get("premium_expires_at")
    if current_expiry and current_expiry.tzinfo is None:
        current_expiry = current_expiry.replace(tzinfo=timezone.utc)
    base = current_expiry if (current_expiry and current_expiry > now) else now
    new_expiry = base + timedelta(days=req.days)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_premium": True, "premium_expires_at": new_expiry}},
    )
    updated = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(updated)

@api_router.post("/admin/users/{user_id}/revoke-premium")
async def admin_revoke_premium(user_id: str, admin: dict = Depends(get_current_admin)):
    await _get_target_user_or_404(user_id)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_premium": False, "premium_expires_at": None}},
    )
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return clean_user(u)

@api_router.post("/admin/users/{user_id}/force-logout")
async def admin_force_logout(user_id: str, admin: dict = Depends(get_current_admin)):
    """Revokes all active sessions for a user, forcing them to sign in again everywhere."""
    await _get_target_user_or_404(user_id)
    result = await db.user_sessions.delete_many({"user_id": user_id})
    return {"ok": True, "sessions_revoked": result.deleted_count}

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(get_current_admin)):
    await _get_target_user_or_404(user_id)
    manifestation_ids = [m["id"] for m in await db.manifestations.find({"user_id": user_id}, {"_id": 0, "id": 1}).to_list(1000)]
    await db.manifestations.delete_many({"user_id": user_id})
    await db.garden.delete_many({"user_id": user_id})
    await db.saved_manifestations.delete_many({"user_id": user_id})
    if manifestation_ids:
        await db.saved_manifestations.delete_many({"manifestation_id": {"$in": manifestation_ids}})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}

@api_router.get("/admin/manifestations")
async def admin_list_manifestations(
    admin: dict = Depends(get_current_admin),
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    query: dict = {}
    if status_filter:
        query["status"] = status_filter
    total = await db.manifestations.count_documents(query)
    items = await db.manifestations.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "items": items}

@api_router.delete("/admin/manifestations/{mid}")
async def admin_delete_manifestation(mid: str, admin: dict = Depends(get_current_admin)):
    result = await db.manifestations.delete_one({"id": mid})
    await db.saved_manifestations.delete_many({"manifestation_id": mid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Manifestation not found")
    return {"ok": True}

# ------------------- Admin: Support Tickets -------------------
@api_router.get("/admin/tickets")
async def admin_list_tickets(
    admin: dict = Depends(get_current_admin),
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    test_ids = await _test_account_user_ids()
    query: dict = {"user_id": {"$nin": test_ids}}
    if status_filter:
        query["status"] = status_filter
    total = await db.tickets.count_documents(query)
    items = await db.tickets.find(query, {"_id": 0, "attachments": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "items": items}

@api_router.get("/admin/tickets/{tid}")
async def admin_get_ticket(tid: str, admin: dict = Depends(get_current_admin)):
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    return t

@api_router.post("/admin/tickets/{tid}/reply")
async def admin_reply_ticket(tid: str, req: TicketReplyRequest, admin: dict = Depends(get_current_admin)):
    reply = req.reply.strip()
    if not reply:
        raise HTTPException(400, "Reply cannot be empty")
    t = await db.tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    now = datetime.now(timezone.utc)
    await db.tickets.update_one(
        {"id": tid},
        {"$set": {"admin_reply": reply[:5000], "admin_replied_at": now, "status": "replied", "updated_at": now}},
    )
    # In-app-only notification (no push/email) — surfaced via the bell icon + notifications
    # list on the Me tab, and cross-referenced against the ticket list to show an "unread reply"
    # dot on the specific ticket.
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": t["user_id"],
        "type": "ticket_reply",
        "title": "Support replied to your ticket",
        "body": reply[:140],
        "ref_id": tid,
        "is_read": False,
        "created_at": now,
    })
    updated = await db.tickets.find_one({"id": tid}, {"_id": 0})
    return updated

@api_router.post("/admin/tickets/{tid}/close")
async def admin_close_ticket(tid: str, admin: dict = Depends(get_current_admin)):
    result = await db.tickets.update_one({"id": tid}, {"$set": {"status": "closed", "updated_at": datetime.now(timezone.utc)}})
    if result.matched_count == 0:
        raise HTTPException(404, "Ticket not found")
    updated = await db.tickets.find_one({"id": tid}, {"_id": 0})
    return updated

# ------------------- Root -------------------
@api_router.get("/")
async def root():
    return {"message": "mTree API", "status": "ok"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
