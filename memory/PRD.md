# mTree — Product Requirements & Progress

## Original Problem Statement
Build a mobile app: import from https://github.com/clayjohnson706-art/mtreev3

## What is mTree
Android-first manifestation app. Core loop: **Goal + Intention (Deity) + Sacrifice = Manifestation**.
Users start a cycle-based manifestation, perform a daily "Hold to Manifest" ritual to grow their
streak/tree, can link a Hustle (side habit) and Fasting, and premium users get a Community Wall
to share/save others' completed manifestations.

## Architecture
- Frontend: Expo Router (React Native), TypeScript, MongoDB-backed FastAPI (`/api` prefix).
- Auth: Emergent-managed Google Sign-in (kept as-is per user choice) + a `dev-login` endpoint
  used only for automated testing (creates/fetches a `@*.mtree.dev`-style test user).
- Payments: `/api/subscribe` is an intentional STUB — every new user gets `is_premium=true`.
  No real Google Play Billing yet (user's explicit choice for this phase).
- Notifications: local on-device scheduling via `expo-notifications`, lazy-`require()`'d and
  wrapped in try/catch in `src/utils/notifications.ts` / `app/_layout.tsx` because the package
  throws at import time in Expo Go on Android (SDK53+ dropped remote-push there) — everything
  degrades to a safe no-op in that environment and works fully in a real dev/production build.

## Key Decisions / User Choices
- Import as-is, then continue building features.
- Keep Emergent-managed Google Sign-in.
- Keep `/api/subscribe` as a free stub for now.
- Translation LLM choice for the 22 Indian + global languages: **on hold**, user will supply
  content later — architecture is ready (`language` param + user preference saved), backend
  currently always serves English text for every language selection (explicit user decision).
- **2026-02**: Added native 1-tap Google Sign-In using the user's OWN Google Cloud OAuth
  credentials (Web Client ID + Android package `com.mtree.app` + SHA-1), as an addition
  alongside (not a replacement of) the Emergent-managed browser flow. User explicitly accepted
  the trade-off that native Google Sign-In only works in a real dev/production build (not Expo
  Go) — see "Native Google Sign-In" section below.

## What's Been Implemented (dated)
**2026-07-19 — Import + fixes**
- Imported backend (`server.py`) + frontend (`app/`, `src/`) verbatim from GitHub.
- Installed missing deps: `react-native-svg`, `@gorhom/bottom-sheet`,
  `@react-native-community/datetimepicker`, `expo-notifications`.
- Purged all dev/test/bot users + fake wall entries from MongoDB; added a permanent
  `backend/tests/conftest.py` session-teardown fixture that auto-purges any `*mtree.dev` test
  user (and cascade data) after every pytest run, so the DB/Wall never accumulate test data again.
- 74/74 backend pytest passing.

**Feature additions (same day)**
1. Reminder system: local daily notifications (`src/utils/notifications.ts`), reminder frequency
   up to 10x/day, tap-to-open calming popup (`app/ritual-reminder.tsx`).
2. Home header "Reminder Center" bell icon (`testID=home-reminder-bell`) — visible once
   reminders have EVER been enabled for the active manifestation (`reminders_ever_enabled`
   sticky flag, backend), gold when currently on / muted-gray when off, never disappears once
   set. Tapping opens `src/components/ReminderCenter.tsx` (scrollable bottom sheet) with:
   instant enable/disable toggle, frequency chips, **Random vs Custom schedule modes**
   (`computeRandomReminderTimes` avoids busy hours + clustering; Custom lets the user pick each
   reminder's exact time), busy-hours (Do Not Disturb) editor, Save.
3. Hustle/Fasting home cards now visually match Goal/Sacrifice cards (matching border/radius).
4. Affirmation language selection: `LanguagePicker` (search bar, 53 languages — 22 official
   Indian languages + English + ~30 major global languages, native-name labels). Preference is
   saved (`affirmation_language`) but backend currently always serves English affirmation text
   for every language (explicit "not yet, translations later" decision) — no placeholder/partial
   translations left in code.
- Bug fix: ReminderCenter sheet is now wrapped in a `ScrollView` (was previously unscrollable
  when many chips/custom time rows made content taller than the sheet) — verified via Playwright
  with 10x custom-time reminders on a 375×667 viewport.

**2026-07-19 — Hold-to-Manifest fix + Categories/Affirmations/Onboarding/Language/Tooltip update**
1. **Hold to Manifest bug fix** (`app/(tabs)/home.tsx`): the previous implementation completed
   the ritual via a fixed `setTimeout` that fired 3.5s after press-down regardless of whether
   the user released early — `endHold()` only cancelled the Reanimated visual animations, never
   the timeout. Rewrote it so ritual completion is driven ONLY by the `withTiming` completion
   callback on `holdProgress` (`finished === true` fires `runOnJS(completeHoldRitual)`); an early
   release calls `cancelAnimation()`, which makes `finished === false`, so the ritual can no
   longer complete on a partial hold.
2. **Expanded categories + real per-category, per-language affirmations**: merged the
   user-provided `merged-1784482232744.json` (35 affirmation categories × 54 languages) into the
   app.
   - `GOAL_CATEGORIES` grew from 13 → 36 (added happiness, success, wisdom, gratitude, fitness,
     beauty, friendship, abundance, self_love, courage, patience, discipline, forgiveness,
     purpose, leadership, harmony, protection, focus, joy, healing, prosperity, inner_strength,
     positivity). Existing keys/emojis were kept as-is to avoid disrupting existing manifestations.
   - `SACRIFICE_CATEGORIES` grew from 13 → 37 (added smoking, complaining, jealousy, anger,
     excuses, self_doubt, comparing, screen_time, sugar, late_nights, impulse_buying,
     binge_watching, people_pleasing, perfectionism, mindless_scrolling, fast_food, caffeine,
     revenge, gambling, lying, drugs, porn, toxic_music, road_rage).
   - Backend: added `backend/data/affirmations_i18n.json` (curated data) + `AFFIRMATIONS_I18N`,
     `CATEGORY_ALIASES` (`relationship` → `love`, preserves old key), and `LANGUAGE_CODE_MAP`
     (frontend language slug → 2/3-letter data code). `/api/affirmations/{category}` now returns
     the real curated affirmation in the user's selected language (54 languages supported) with
     an English fallback, replacing the old English-only stub.
3. **Language reorder**: `LANGUAGES` in `theme/index.ts` now orders English → Hindi → all Global
   languages → all remaining Regional/Indian languages (was previously English → Hindi → Indian
   → Global).
4. **New onboarding** (`app/onboarding.tsx`): replaced the 5 old slides (incl. "The Sacred Tree"
   transformation slide) with 6 new slides — one per current feature: Set Your Goal, Choose Your
   Sacrifice, Daily Commitment (Hold to Manifest), Link Your Hustle, Fasting (Honor-Based), Daily
   Affirmations. Visual changed from `TreeHero` to a simple glowing emoji badge per slide.
5. **Tooltips removed**: deleted `src/components/FeatureTour.tsx` and all its wiring in
   `home.tsx` (`tourVisible` state, `finishTour`, first-run effect). `tour_done` field left as an
   unused, harmless leftover on the User model/DB (no migration needed).

**2026-07-19 — Re-imported into new environment**
- Imported full codebase (backend, frontend, memory, store_assets, tests) verbatim from
  `https://github.com/clayjohnson706-art/mtreev4` into this pod via `git clone` + rsync
  (excluded `.git`, `.emergent`, `node_modules`, `.env` files to preserve pod-specific config).
  Installed backend (`pip install -r requirements.txt`) and frontend (`yarn install`, fresh
  `yarn.lock` regenerated) dependencies. Fresh MongoDB instance (empty DB) in this pod.
- Testing agent: 74/74 backend pytest passing (fixed 2 stale test assertions that assumed old
  pre-i18n English-fallback affirmation behavior). Full frontend E2E smoke test passed: onboarding
  → deity → profile-setup → manifest-setup (goal/sacrifice/cycle/reminders/affirmation/hustle/
  fasting) → Hold-to-Manifest ritual → Wall → Settings, no errors. Test data cleaned up after run.

**2026-07-19 — Play Store launch prep: auth links, agreement checkbox, security fix, Admin Panel**
- Auth screen (`app/auth.tsx`): added tappable "Terms" (`.../mtreeapptermsandconditions/`) and
  "Privacy Policy" (`.../mtreeprivacypolicy/`) links, plus a mandatory agreement checkbox —
  "Continue with Google" is disabled (greyed) until the user checks it.
- **Security fix**: `/api/auth/dev-login` was previously open to ANY email (account-takeover risk
  if left live in production). Now gated behind `ENABLE_DEV_LOGIN=true` env var AND restricted to
  `@mtree.dev` emails only — safe by default, still usable for automated testing in this pod.
- **New Admin Panel** (backend `ADMIN_EMAILS` env var + `get_current_admin` dependency,
  `/api/admin/stats|users|manifestations` routes; frontend `app/admin.tsx`, entry point in
  Settings shown only when `user.is_admin`): stats dashboard (users/premium/active/completed/
  wall-post counts), searchable user list with detail modal (toggle premium, delete user +
  cascade data), Wall Posts tab (list + delete completed public manifestations). Admin access:
  `nextleveldev706@gmail.com` (real Google account, added to `ADMIN_EMAILS`).
- **Block/Unblock users**: Admin Panel user detail modal now has a "Block Access" section —
  block a user for 1/7/30 days or permanently (chips), or unblock instantly (green button).
  Backend (`POST /api/admin/users/{id}/block|unblock`) sets `is_blocked`/`blocked_until`;
  `get_current_user` rejects any request from a blocked user with 403 (even with a valid
  session token) and auto-clears expired temporary blocks. Frontend (`AuthContext`) detects
  this 403, force-logs the user out, and shows a dismissable "Your account has been blocked"
  banner on the auth screen. Backend: 105/105 pytest passing (11 new block/unblock tests).
- **Admin Panel v2 — full user control**: user list row now opens a full-screen "User Details"
  panel (not a small popup) with: inline-editable name, Public Profile toggle (now persists),
  Premium toggle + extend-by-days chips (+7/+30/+90/+365, stacks on active expiry) + Revoke
  Premium button, full Manifestations list per-user with individual delete, Force Logout (All
  Devices) button, Block Access (from prior round), and Delete User. Backend adds
  `PATCH .../users/{id}` name support + `POST .../extend-premium|revoke-premium|force-logout`.
  Backend: 117/117 pytest passing.
- **Admin self-protection**: admin accounts (`ADMIN_EMAILS`) are excluded from the Admin Panel
  users list entirely, and every mutating admin endpoint (delete/block/unblock/patch/
  extend-premium/revoke-premium/force-logout) rejects any attempt to target an admin's
  user_id with 400 "Cannot perform this action on an admin account" — defense in depth even
  if the id were guessed directly via API. Read-only detail fetch still works. Backend:
  130/130 pytest passing.

**2026-07-20 — Country detection + localized currency + admin donation tracking**
- Country detected automatically from device locale (`expo-localization`, no permission
  prompt) and pre-filled in onboarding's new Country field (below DOB); user can change via
  a searchable `CountryPicker` (also reachable later from Settings → REGION → Country).
  Saved to `user.country` (ISO2 code).
- Prices (Subscription page) and donation amounts (post-ritual donation flow) now display in
  the user's local currency using a fixed ~30-currency approximate exchange-rate table
  (`src/theme/currency.ts` frontend / `CURRENCY_RATE_PER_INR` + `to_usd()` backend, INR as
  base/pivot) — no live FX API, by explicit user choice since no real payment gateway exists
  yet. Donations are stored with both `donation_amount` and `donation_currency`.
  - Admin Panel: user list shows each user's country (flag + code); full detail view shows
  country (flag + name) and a new "DONATIONS" section with `Total Donated` converted to USD
  across all of that user's manifestations, for cross-user comparability.
  - Backend: 138/138 pytest passing (8 new tests). Frontend fully verified via testing agent,
  zero regressions on prior onboarding/admin panel functionality.

**2026-07-19 — Home screen layout + hold-ritual glow centering fix**
- Card order changed: Moon Phase + Cosmic Energy row → Daily Affirmation → Deity Hero →
  Daily Streak bar → Your Journey (affirmation moved above deity, below moon/cosmic).
- Deity Hero card slightly reduced in size (240 → 210) for a more compact home screen.
- Fixed a bug where the golden hold-energy glow during the "Hold to Start" ritual appeared
  visually off-center from the deity stone mid-hold, only snapping to center after completion.
  Root cause: the glow/seed (absolutely positioned) were siblings of the deity symbol AND the
  text labels below it inside one flex column — Yoga positions absolute children at the
  container's top-left by default (ignoring `justifyContent: center` on siblings), so they
  didn't align with the deity's true visual center once labels below shifted the "block"
  center down. Fix: wrapped glow + deity symbol + seed together in a dedicated
  `heroSymbolWrap` sized exactly to the deity, decoupled from the labels below.
- Verified via testing agent: correct order, smaller deity card, glow centered throughout
  the full 4s hold (checked at ~1s/2s/3s) and after completion. No regressions.
- Backend: 94/94 pytest passing (20 new admin/dev-login security tests added).
- Note: a REAL user (`mjrd1402@gmail.com`) has signed in via real Google OAuth and created a live
  manifestation in this environment — this is genuine data, not a test artifact; never delete it.

**2026-07-28 — Mandatory Checklist Phase 4 (Sections 10-12): Ritual tab, Help/Ticket system, Wall timer fix**
- **Section 10 — new 4th "Ritual" tab** (`app/(tabs)/ritual.tsx`): tab order is now
  Home → Wall → Ritual → Me (sparkles icon), swipe-navigable via `SwipeNav`'s `ORDER` array.
  Active manifestation: Deity name, daily affirmation card (custom text or language-fetched,
  or an "affirmation not enabled" note), sacrifice chant ("I am sacrificing X to get Y"), bold
  "Chant affirmation 10 times in mind" instruction, Goal/Sacrifice/Fasting/Hustle icon tiles,
  and a ritual-status pill (pending/complete for today) with a CTA back to Home when pending.
  No active manifestation: 4 icon-based philosophy cards (Goal+Sacrifice, Consistency, Fasting,
  Daily Hustle — graphical, not text blocks) + "Begin New Manifestation" + "Contact Us" CTAs.
- **Section 11 — Help/FAQ + Contact/Ticket system + in-app Notifications**:
  - `app/help.tsx`: 12-question tap-to-expand FAQ accordion (LayoutAnimation) + Contact Us CTA.
  - `app/contact.tsx`: ticket list + "+ New Ticket" form (Subject, Description, up to 3 photo
    attachments via `expo-image-picker`, full permission contract — checks current state,
    contextual request only on tap, denied/blocked handling with an Open Settings banner).
    Attachments stored as **raw base64 in MongoDB** (per user's explicit choice — no cloud
    storage integration). Ticket detail sheet shows attachments + admin reply or "awaiting
    reply" state.
  - `app/settings.tsx`: new "HELP & SUPPORT" section (Help & FAQ, Contact Us / My Tickets rows).
  - `app/(tabs)/me.tsx`: notification bell (top-right, red unread-count badge) opens an
    in-app-only Notifications list modal (no push/email, per user's explicit choice). Tapping
    a `ticket_reply` notification marks it read and deep-links to `/contact?ticketId=X`,
    auto-opening that ticket.
  - `app/admin.tsx`: new 3rd segment "Tickets" tab (alongside Users/Wall Posts) + an
    "Open Tickets" stat card. Ticket detail modal shows attachments, previous reply, a reply
    TextInput + Send Reply (creates a `notifications` doc for the user), and Mark as Closed.
  - Backend (`server.py`): new `tickets` + `notifications` Mongo collections. Endpoints:
    `POST/GET /api/tickets`, `GET /api/tickets/{id}`, `GET/POST /api/notifications*`,
    `GET /api/admin/tickets`, `GET /api/admin/tickets/{id}`,
    `POST /api/admin/tickets/{id}/reply` (also inserts the notification doc),
    `POST /api/admin/tickets/{id}/close`. `/api/admin/stats` now also returns `open_tickets`.
  - Attachments are images-only by design decision (covers the practical "screenshot for a bug
    report" use case while keeping base64 payloads small; not full arbitrary-file support).
- **Section 12 — Wall timer persistence fix** (`app/(tabs)/wall.tsx`): the 16-minute Community
  Wall refresh countdown now survives a full app close/reopen, not just tab-switching (which
  was already fixed in an earlier phase). Persists `{timestamp, filtersKey, items, savedIds}`
  to `AsyncStorage` (`mtree_wall_cache_v1`) on every successful fetch; on first mount only, a
  still-valid non-expired cache matching the current filters is restored (items + remaining
  countdown) instead of firing a fresh `/api/community/wall` call — this also protects the
  server-side "fair rotation" (`last_shown_at`) from being reset prematurely on every cold start.
  Any filter change or actual countdown expiry still always fetches fresh, unchanged.
- Verified via testing agent: 13/13 new backend tests passing (ticket/notification CRUD +
  per-user scoping + admin-auth rejection for all new admin routes), 97 passed / 31 pre-existing
  failed / 64 admin-OAuth-gated errors on the full baseline suite (unchanged, zero new
  regressions). Frontend: Ritual tab both states, swipe nav, FAQ accordion, ticket create/list/
  detail flow, Settings rows, notification bell + empty state, and wall-timer-survives-reload
  all verified live via Playwright. Admin ticket-reply UI could only be code-reviewed (pre-
  existing real-Google-OAuth-only limitation for `/admin`, documented in test_credentials.md).

## Play Store Launch Notes
- Real Google Play Billing NOT set up yet (user has no merchant/payments profile) — `/api/subscribe`
  stays a free stub for initial launch. Steps when ready: create app draft in Play Console (no AAB
  needed yet) → Monetize → Payments profile (merchant account) → Monetize → Products (subscriptions)
  → then wire up billing library + backend receipt verification.
- New personal Play Console developer accounts (created after Nov 2023) need a **closed test with
  12 testers opted in for 14 continuous days** before Production access unlocks.
- No built-in DB viewer on Emergent — use the Admin Panel (`/admin` in-app) or code-editor terminal
  (mongo shell) to inspect data. Future updates after Play Store launch require rebuilding via the
  Emergent "Publish" button and uploading the new build as a new Play Console release (no separate
  OTA channel in this setup).

## Prioritized Backlog / Next Steps
- P0: User will self-test the above 5 changes (explicitly asked to skip testing_agent this round).
- P1: Real Google Play Billing integration when user is ready to move off the payments stub.
- P1: Real English-first non-affirmation content translations (menus, UI copy) if ever requested —
  affirmations themselves are now fully translated across 54 languages.
- P1: Regenerate store_assets/screenshots for Play Store listing (user will provide later).
- P1: Shareable "streak milestone" card (e.g. Day 7/21/40 streak) to boost word-of-mouth —
  user acknowledged interest, explicitly deferred to a later session, not yet built.
- P2: Push/local notification reliability testing on a real Android build (Expo Go can't fully
  validate closed-app/reboot delivery).

**2026-07-20 — Onboarding back-button lockdown, timezone-based country detection, fixed donation tiers**
- **Onboarding/profile-setup back-button bypass fix**: `BackHandler` added to `onboarding.tsx`
  (slide 1: double-tap-within-2s to exit app + in-app "Press back again to exit" toast, incl.
  `ToastAndroid` on Android; slides 2-6: back goes to the previous slide instead of exiting),
  `profile-setup.tsx` (hardware back fully blocked — mandatory, never reused as an "edit
  profile" screen), and `deity.tsx` (blocked only during first-time onboarding when
  `!user.profile_done`; normal back allowed when reached later from Settings to change deity).
  Root `_layout.tsx` also disables the iOS swipe-back gesture on `onboarding` and
  `profile-setup`. Native-only (`BackHandler` has a safe no-op shim on web) — cannot be
  verified via Expo web preview/Playwright, requires an Android device/emulator.
- **Country detection fix**: `detectDeviceCountry()` in `src/theme/currency.ts` now checks the
  device **timezone** first (via `Localization.getCalendars()[0].timeZone`, mapped through a
  new `TIMEZONE_COUNTRY` table for ~50 zones) before falling back to locale region code, then
  "US" as a last resort. Fixes the root cause: many Android phones (common in India/SE Asia)
  ship with display language "English (United States)" regardless of actual location, which
  made the old locale-only check always report US.
- **Fixed donation tiers**: `success.tsx` donation step replaced the free-text amount input
  with 6 fixed INR tier buttons (₹101/₹201/₹501/₹1,001/₹10,001/₹50,001), each displayed in the
  user's localized currency via `formatPrice()`. Bug found + fixed during testing: backend's
  `donation_amount` is a strict `int`, but `convertFromINR()` can return a float for most
  non-INR currencies — fixed by sending `Math.max(1, Math.round(convertFromINR(...)))` (floor
  of 1 unit so very-low-value currencies like KWD/BHD/OMR never round down to a "free" 0).
- Also clarified via investigation: a reported Google Sign-In "disallowed_useragent" error was
  traced to the user testing with "Via Browser" (a proxy/compression browser Google blocks for
  all OAuth, not an app bug) — works fine in Brave/Chrome/Safari. No code change needed/made.
- Backend: 138/138 pytest passing, unchanged (no backend code touched this session) + 18/18
  new donation-rounding regression tests added by testing agent. Frontend verified via testing
  agent (donation tier UI + rounding fix confirmed working end-to-end); BackHandler-based
  back-button blocking explicitly flagged as untestable in this environment (native-only).

**2026-07-20 — Deity-selection "stuck screen" fix (real user report)**
- Real user (`mjrd1402@gmail.com`) reported: logged in, saw the onboarding tutorial twice, then
  got permanently stuck on deity selection (Continue did nothing). Root cause (pre-existing bug,
  unrelated to same-day changes above): `deity.tsx`'s `confirm()` called `router.back()`
  whenever `profile_done` was already true, assuming this screen is only ever reached via
  `router.push` from Settings (which has back history) — but when reached through the
  onboarding redirect chain (all `router.replace`, no back history), `router.back()` silently
  no-ops, leaving no way forward.
- Fix: `if (router.canGoBack()) router.back(); else router.replace("/(tabs)/home")`. Verified
  by DB check that the affected real account's data was already fully correct
  (onboarding_done/deity_id/profile_done all set) — a fresh app reopen alone would also have
  unstuck them; the code fix prevents recurrence for any user who lands here without back
  history. Verified via testing agent: bug-repro scenario now reaches Home, "change deity from
  Settings" still correctly returns to Settings (no regression), full fresh-onboarding path
  unaffected.

## Test Credentials
See `/app/memory/test_credentials.md` — dev-login endpoint for automated testing, real account
`mjrd1402@gmail.com` (Google-only, preserved, not to be used for automated login attempts), and
admin account `nextleveldev706@gmail.com` (real Google sign-in required, no dev-login).

**2026-07-20 — 3 feature updates: Journey intro, deity alignment fix, ritual-reminder card**
1. **First-Time Journey Guidance**: new `app/journey-intro.tsx` — 3 swipeable cards ("Your
   Journey Starts Now", "Keep Your Promise" with 4 bullets, "You're Ready") shown exactly once,
   right after a user's very FIRST manifest-setup completion, before they ever reach the Home
   ritual button. "Got It" on card 3 sets `journey_intro_seen=true` (new backend User field,
   added to `UserProfile`/`ProfileUpdate` models + both user-creation paths) and routes to Home.
   `manifest-setup.tsx`'s `submit()` checks this flag to decide journey-intro vs. straight-to-
   home. Added to root Stack with `gestureEnabled:false` (same as onboarding/profile-setup).
2. **Deity selection alignment fix**: removed the asymmetric `rowOffset` (`marginLeft: 42`) that
   was only applied to the middle row of the 3-2-2 deity grid, causing visible misalignment.
   Rows now rely on the parent's `alignItems:"center"` + `justifyContent:"center"` on each row
   to auto-center evenly regardless of item count.
3. **Improved Ritual Reminder card** (`app/ritual-reminder.tsx`, shown when tapping a local
   reminder notification): now shows a GOAL pill and a SACRIFICE pill (emoji + label, custom
   text fallback) alongside the real affirmation text (if enabled) and a new rotating
   sacrifice-commitment line ("Don't give up on your sacrifice...", etc.). No-active-
   manifestation case still shows the plain fallback message, no pills, no crash.
- Verified via testing agent: 6 new backend pytest tests (100% pass), full Playwright regression
  of the entire flow (auth→onboarding→deity→profile-setup→home→manifest-setup→journey-intro→
  home) plus targeted ritual-reminder scenarios. No bugs found. New test file:
  `backend/tests/test_journey_intro_and_ritual_reminder.py`.

**2026-07-20 — Journey-intro redesign: compact premium cards + illustrated final card**
- User feedback on the journey-intro feature: convert from full-page slides into small,
  centered, card-style slides (dimmed background overlay behind a single compact `Card`), split
  into 5 cards instead of 3 so text isn't crowded (4 content cards + 1 final card), and make the
  final card clearly guide the user to their first action.
- Cards: "Your Journey Starts Now" → "Keep Your Promise" → "Stay On Track" → "Never Miss a
  Moment" → final "You're Ready" card with a mock illustration of the Home screen's actual
  Hold-to-Start button (fingerprint icon + "HOLD TO START" text in a gold-bordered pill) plus a
  caption pointing the user back to Home. Index-based state switching (not horizontal
  paging/swipe) since card content/height now varies (the final card has the illustration).
  Same backend flag/routing logic as before (`journey_intro_seen`), unchanged.
- Fixed a layout bug found during self-testing before handoff: the Next/Got It button used
  `alignSelf:"stretch"` which anchored it to the left edge instead of centering under the card —
  changed to `width:"100%"` (no alignSelf override) so it centers via the parent's
  `alignItems:"center"`, matching the card above it.
- Verified via testing agent (measured bounding boxes to confirm button-center = card-center =
  viewport-center): all 5 cards render correct content/titles, button label switches
  correctly, "Got It" persists `journey_intro_seen=true` and navigates to Home, no regression on
  first/second-manifestation routing, deity alignment, or ritual-reminder pills.

**2026-07-20 — Journey Cards moved to Home overlay; ritual-complete popup removed; onboarding
tap-transition smoothness fix**
1. **Journey Cards → Home overlay**: extracted the card content from the (now-deleted)
   `app/journey-intro.tsx` route into `src/components/JourneyIntroOverlay.tsx`, rendered as a
   `Modal` overlay ON the Home screen (`app/(tabs)/home.tsx`) instead of a separate navigated-to
   screen. Trigger: `useEffect` watching `active` (manifestation loaded) + `!user.journey_intro_seen`
   — fires the first time a user reaches Home with an active manifestation, same one-time
   backend flag as before (unchanged). `manifest-setup.tsx` now always routes straight to
   `/(tabs)/home` (no more conditional `/journey-intro` redirect). Removed the route's
   `Stack.Screen` entry from `_layout.tsx`.
2. **Removed the "Ritual Completed" popup**: deleted the `showRitual` Modal, its state,
   entrance-animation shared values (`ritualPopScale/Opacity`), and now-unused styles from
   `home.tsx` — completing a ritual is now silent (streak/button state still updates), since the
   Journey Cards overlay already covers the needed guidance.
3. **Onboarding tap-vs-swipe transition fix** (`app/onboarding.tsx`): `goNext()` and the
   hardware-back handler no longer call `setIdx()` immediately after `scrollTo()` — `idx` is now
   updated exclusively by the existing `onScroll` handler (fired by the native scroll animation
   the same way for both tap and swipe), so the dot indicator/title/background transition at the
   identical pace regardless of input method (previously tap made them jump ahead of the
   still-animating scroll).
- Verified via testing agent: overlay trigger/dismiss + persistence correct, no
  "ritual-complete-card" anywhere in the DOM after completing a ritual, and empirically confirmed
  `idx` no longer jumps instantly on tap (checked DOM at 30ms then 600ms after tap). No bugs found.

**2026-07-20 — Fixed: Journey Cards overlay never appeared (trigger bug)**
- Root cause: the trigger required an active manifestation (`if (active && !user.journey_intro_seen)`),
  but `profile-setup.tsx` routes straight to `/(tabs)/home` — a brand-new user's TRUE first Home
  visit happens BEFORE they've ever created a manifestation (Home shows "Begin New
  Manifestation" at that point, not Hold-to-Start). `active` was null then, so the overlay could
  never fire — last session's test happened to pre-create a manifestation via direct API call,
  which accidentally masked this exact bug.
- Fix: trigger now fires purely on `!user.journey_intro_seen` (no `active` dependency) in
  `home.tsx`. `JourneyIntroOverlay` now takes a `hasActiveManifestation` prop so its final card
  adapts: shows "BEGIN NEW MANIFESTATION" guidance (pointing at that Home button) when no
  manifestation exists yet, or "HOLD TO START" (as before) when one already does.
- Verified via testing agent: reproduced the exact real-user flow (onboarding/profile done, zero
  manifestations) — overlay now fires correctly on that first visit with the adaptive final card,
  persists `journey_intro_seen=true`, never reappears; original with-manifestation scenario still
  passes too. No bugs found.

**2026-07-20 — Fixed (3rd attempt): Journey Cards fired prematurely + duplicate final-card variant**
- User report: cards were appearing immediately after login/before onboarding (for pre-existing
  test users who'd already completed onboarding in an earlier session), and there were TWO
  different final-card endings ("Hold to Start" vs the previous session's "Begin New
  Manifestation" adaptive variant), perceived as two duplicate flows.
- Root cause: the previous session's fix triggered the overlay on ANY first Home visit purely
  based on `!user.journey_intro_seen` — with no way to distinguish "just finished onboarding,
  no manifestation yet" from "just finished manifest-setup" other than the now-removed adaptive
  final card, which itself caused the "two flows" confusion.
- Fix: replaced ALL state-inference with a fully deterministic one-time navigation param.
  `manifest-setup.tsx`'s `submit()` now does
  `router.replace({ pathname: "/(tabs)/home", params: { showJourneyIntro: "1" } })` — but only
  on a user's first-ever manifestation completion (`!user.journey_intro_seen`). `home.tsx` reads
  this via `useLocalSearchParams` and shows the overlay ONLY when the param is present (then
  immediately clears it via `router.setParams`) — nothing else can trigger it, eliminating any
  ambiguity about timing. `JourneyIntroOverlay` reverted to a single, consistent 5-card sequence
  always ending with "HOLD TO START" — the adaptive "Begin New Manifestation" variant was
  removed entirely (there is now exactly ONE Journey Cards experience).
- Verified via testing agent (5 scenarios including the real manifest-setup wizard UI end-to-end,
  not just simulated params): no premature firing on a plain Home visit, correct firing via the
  param, single consistent card sequence, persistence + no-reappear all pass. No bugs found.

**2026-07-20 — Fixed: Journey Cards looked like a separate opaque page, not a modal overlay**
- Root cause: `JourneyIntroOverlay.tsx` rendered a full `<AnimatedBackground>` starfield plus a
  solid `backgroundColor: COLORS.void` on its container INSIDE the (already-transparent) React
  Native `Modal` — this made the whole thing opaque, completely hiding the real Home screen
  still mounted/rendered behind it, so it looked like a full-screen navigated page instead of a
  dialog overlay.
- Fix: removed `AnimatedBackground` and the opaque void background entirely; the Modal's
  container is now a single semi-transparent dark backdrop (`rgba(0,0,0,0.72)`), so Home's real
  content (moon phase, cosmic energy, affirmation, streak, Hold to Start button, tab bar) stays
  fully visible/legible (dimmed) behind the centered rounded card — a proper premium modal feel.
- Verified via testing agent (screenshot-based): Home's content confirmed visible/dimmed behind
  the overlay, "Got It" closes in-place with no navigation/reload, card sequence/trigger timing
  unchanged and still correct. No bugs found.

**2026-07-20 — Changed: Journey Cards now recur every new manifestation (not one-time-only)**
- User clarified intended behavior: the overlay should reappear EVERY time a user starts a NEW
  manifestation journey (completes manifest-setup and taps "Start Manifestation"), not just
  their very first one ever — a recurring reminder of their commitment before each new journey.
- Change: `manifest-setup.tsx`'s `submit()` now unconditionally passes the
  `?showJourneyIntro=1` redirect param (previously gated on `!user.journey_intro_seen`).
  `home.tsx`'s trigger effect no longer checks/gates on `user.journey_intro_seen` at all — it
  fires purely off the one-time navigation param, still never during login/onboarding/plain Home
  visits. `JourneyIntroOverlay.tsx` no longer persists `journey_intro_seen` on "Got It" (no
  longer meaningful since it's not one-time). The backend `journey_intro_seen` field still
  exists in the User model but is now vestigial/unused for gating — left in place to minimize
  risk, not removed.
- Also fixed a real bug found during this session's manual testing: calling
  `router.setParams()` synchronously in the same effect that fires on the very first render
  could throw "Attempted to navigate before mounting the Root Layout" when landing directly on
  `/home?showJourneyIntro=1` — deferred via `setTimeout(..., 0)` to fix.
- Verified via testing agent: direct-param test (overlay shows despite `journey_intro_seen=true`),
  regression (plain `/home` never shows it), and — most importantly — ran the REAL manifest-setup
  wizard UI twice for the same user (2 separate manifestations) and confirmed the overlay
  correctly reappeared both times. Zero console errors. No bugs found.

## Native Google Sign-In (added 2026-02)
- Added `POST /api/auth/google` (backend `server.py`) — verifies a Google ID token server-side
  against `GOOGLE_WEB_CLIENT_ID` (google-auth's `id_token.verify_oauth2_token`, checks
  aud/iss/exp), then upserts/logs in the user via the same schema/session model as the existing
  `/auth/session` (Emergent-managed) flow — both auth paths share one `users`/`user_sessions`
  collection.
- Frontend: `src/utils/googleAuth.ts` lazy-`require()`s `@react-native-google-signin/google-signin`
  inside a try/catch (same defensive pattern as `notifications.ts`) — this native module is NOT
  present in Expo Go, so `nativeGoogleSignInAvailable()` correctly returns `false` there and the
  app falls through to the pre-existing Emergent-managed browser-redirect flow with zero crashes.
  `AuthContext.tsx`'s `signIn()` tries native first, falls back automatically. `auth.tsx` shows a
  dismissable error banner (no `Alert`) on a real sign-in failure (silently ignores user-cancel).
- Credentials used (user's own Google Cloud project, NOT Emergent-managed):
  Web Client ID `1048394532561-5hq4cs2bhmne2c6r8alg02urk64tufci.apps.googleusercontent.com`
  (backend `GOOGLE_WEB_CLIENT_ID` + frontend `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`), Android Client ID
  `1048394532561-eke6tlblqie65nfl2b1jb079ll8cn0sd.apps.googleusercontent.com` registered against
  package `com.mtree.app` (Android client ID itself isn't referenced in code — Google matches it
  automatically via package name + SHA-1). iOS was explicitly skipped for now (user's choice).
- **Known limitation (explicit user-accepted trade-off)**: native 1-tap sign-in only works in a
  real dev/production build generated via the Publish button — NOT in Expo Go / this preview's
  QR-code flow, since it requires linked native code. Web preview and Expo Go continue using the
  Emergent-managed browser flow unaffected.
- Testing agent found + fixed a critical regression introduced while inserting the new endpoint
  (a missing newline merged two functions, breaking `/auth/me` → 500 on every authenticated
  request). Fixed and re-verified: 137/152 non-admin pytest passing (unchanged baseline + 4 new
  `/api/auth/google` tests), full dev-login E2E regression passed, zero console errors.

**2026-02 — Admin Panel: sign-in method badge**
- Added `signin_method` field to the User model (`dev_login` | `google_web` | `google_native`),
  set at account-creation time on all 3 auth paths. Admin Panel (`app/admin.tsx`) now shows a
  colored badge — gray "Dev Login", green "Google (Browser)", gold "Google (Native)", gray
  "Unknown" fallback for pre-existing users without this field — both in the Users list row and
  the full User Detail panel ("Signed in via ..."). Confirmed `DELETE /api/account` still works
  identically regardless of `signin_method` (cascade-deletes manifestations/garden/saved/sessions
  the same way for every auth path). Backend: 140/155 non-admin pytest passing (7 new tests),
  same pre-existing 15 stale-test + 45 admin-OAuth-gated baseline, zero new regressions.

**2026-02 — Bug fix: native Google Sign-In fails on real APK ("Sign in failed. Please try again.")**
- User report: on a real Android APK built via Publish, tapping "Continue with Google" ->
  selecting a Google account -> generic failure. Root cause: the Android OAuth Client's SHA-1
  registered in Google Cloud Console during initial setup was from a throwaway debug keystore I
  generated myself — it never actually signed the real production APK, so Google's native SDK
  rejected the sign-in (classic DEVELOPER_ERROR symptom: account picker works, fails right after
  selection). Fix: downloaded the user's actual APK, parsed its APK Signing Block (v2 scheme)
  directly with a one-off Python script to extract the REAL signing certificate SHA-1:
  `45:EE:2B:33:28:ED:FC:47:06:69:58:82:80:26:8B:CC:72:1C:35:CC` (saved to test_credentials.md) —
  user needs to add this to the Android OAuth Client in Google Cloud Console (their action, not
  fixable purely via code). Also improved `googleAuth.ts`/`auth.tsx` to surface the real native
  error code/message in the error banner instead of a generic message, for self-diagnosis of any
  future native sign-in failures. Verified via testing agent: zero regressions, 140/155 backend
  pytest passing (unchanged baseline), full E2E dev-login flow + web Google-fallback unaffected.
  The actual native flow itself remains unverifiable in this preview environment by design —
  user must retest on their device after updating the SHA-1 in Google Cloud Console.

**2026-02 — Bug fix: false logout on rapid tab/Settings navigation + smoothness pass**
- User report: navigating quickly between tabs (Home/Wall/Me) and opening/closing Settings
  repeatedly sometimes unexpectedly redirected to the login screen. Root cause: `getToken()`
  (`src/utils/api.ts`) hit native SecureStore fresh on every single call with zero caching — a
  burst of concurrent reads from multiple screens' focus-effect fetches firing at once (typical
  during rapid navigation) could occasionally hit a transient native storage glitch that returns
  a false `null` (the storage wrapper silently swallows all errors by design). `AuthContext.
  refresh()`'s `if (!token) { setUser(null); return; }` fast path trusted that immediately with
  zero retry — unlike its OWN 401/403 path a few lines below, which already retries once before
  confirming a real logout. Fix: `getToken()` now caches the token in memory after the first
  successful read (all later calls, however many fire concurrently, read the cache — no more
  racing native storage) and retries once on a null FIRST read before trusting it, closing the
  exact asymmetry that caused this. Also deferred the focus-triggered data fetches in
  `settings.tsx`, `(tabs)/home.tsx`, `(tabs)/me.tsx` via `InteractionManager.runAfterInteractions`
  so they no longer compete with the slide/gesture transition for the JS thread, and wrapped
  `AnimatedBackground` (25 animated children per screen) in `React.memo` to avoid re-reconciling
  it on unrelated parent re-renders. Verified via testing agent: 15-20 rapid tab-switch cycles +
  8-10 rapid Settings open/close cycles, zero false logouts; explicit signOut/deleteAccount still
  correctly redirect; Home/Me/Settings still correctly load their (now-deferred) data; backend
  unaffected (140/155 baseline unchanged, no backend code touched).

**2026-02 — Follow-up: corrected a factually-wrong "investigation report" relayed by the user**
- User relayed a 2-part fix prescribed by an unnamed external "investigation team" (arrived
  alongside language about tracking an "escalation" and a "40 ECU credit refund" via email —
  treated as unverifiable/out-of-scope, not acted on). Verified each part independently before
  touching code:
  1. "Add a 300ms debounce to RequireAuth.tsx's redirect effect" — technically sound, low-risk,
     consistent with the codebase's existing defensive style. IMPLEMENTED: redirect now waits
     300ms and re-checks `user` via a ref (latest value, not a stale closure) before actually
     calling `dismissAll()`/`replace('/auth')`; cleared on unmount/dep-change.
  2. "Remove the inner `<RequireAuth>` from settings.tsx since the tabs layout already handles
     it" — FACTUALLY INCORRECT and NOT implemented. `app/settings.tsx` is a top-level root Stack
     screen (a sibling of the `(tabs)` group), not nested inside `app/(tabs)/` — the tabs
     layout's `RequireAuth` wraps only the Tabs navigator (home/wall/me) and has zero effect on
     `/settings`. Removing it would have left Settings with NO auth guard at all.
  - Testing agent independently confirmed this decision: verified `/settings` is still fully
    protected (unauthenticated direct navigation → loading spinner → redirect to `/auth`, never
    renders content), confirmed 20 rapid tab-switch + 10 rapid Settings cycles → 0 false logouts,
    confirmed genuine signOut()/deleteAccount() still redirect within ~240ms (well under the
    300ms window, no perceptible lag added). One cosmetic-only dev warning noted (POP_TO_TOP on
    an empty nav stack) — functionally harmless, optional follow-up.

**2026-02 — Phase 1 of a large 30-item user request (Performance + Logo + Sign-Out fix)**
- User sent a 30-item mega-request (performance overhaul, full visual redesign, sign-out fixes,
  mandatory custom-affirmation flow, full notification rewrite, home layout changes, a new 4th
  "Ritual" tab, FAQ + ticket/support system with admin reply, wall timer persistence). Scoped
  into phases via `ask_human` before starting — confirmed: keep Home's `DeityHero` glow
  always-on but remove the generic animated background everywhere else; ticket replies are
  in-app only (no email); proceed autonomously phase-by-phase across turns; new 4th tab named
  "Ritual". Phase 1 (this session) covers Sections 1, 2, 3 of the original request:
  - `AnimatedBackground.tsx` rewritten from 25 continuously-running Reanimated elements (3
    drifting blobs + 22 twinkling stars, mounted fresh on every screen) to a fully STATIC dark
    purple gradient + 2 fixed tinted circles — zero animation, memoized. This was almost
    certainly the single biggest contributor to the "feels like 10fps" complaint.
  - `SwipeNav.tsx`'s tab-focus-enter transition changed `withSpring` → `withTiming` (clean
    monotonic ease-out) to fix a reported "shaking" feel specifically on tab-bar TAPS; drag-
    release/swipe-gesture physics (still `withSpring`) deliberately left unchanged.
  - New lotus/flame logo applied app-wide by overwriting the 4 underlying asset files (`icon.png`,
    `adaptive-icon.png`, `favicon.png`, `gen_logo_a_constellation_v2_secondary.png`) in place —
    zero code changes needed since every existing reference (auth screen, splash, `AppLogo`
    header) already points to these same filenames.
  - Sign-out bug: removed the "Sign Out" button entirely from `(tabs)/me.tsx` (the swipe-heavy
    profile tab where accidental brushing was reported) — discovered during this work that both
    `me.tsx` and `settings.tsx` already had a confirmation-modal gate on sign-out from an earlier
    session (not this one), so the only remaining action needed was removing the Me-tab instance
    entirely; Settings' sign-out (with its existing confirm dialog) is now the sole entry point.
  - Verified via testing agent: Sign Out confirmed to have zero occurrences on Me tab; Settings'
    confirm-dialog flow (cancel + confirm) works correctly; new logo confirmed live on auth
    screen + Home header, old logo confirmed gone from all referenced files; static background
    confirmed (no Reanimated code, visually static across screens); tab-tap navigation smooth,
    zero false logouts across repeated cycles; backend regression baseline unchanged.
- **Deferred to later phases** (communicated to user): Sections 4-12 — custom affirmation
  mandatory-flow system, custom sacrifice display everywhere, full notification content/logic
  overhaul (remove "Om", fix splash-loop bug, fix wrong-deity flash, 8PM-local streak check,
  reminder save-button visibility), home screen layout changes (bigger deity card, skeleton
  loader, pre/post-selection layouts), hold-to-manifest card content replacement, onboarding
  flow fixes (Describe page move, keyboard overlap, card sizing), new 4th "Ritual" tab, Help/FAQ
  page, Contact/ticket system + admin reply UI, manifestation wall timer persistence fix.

**2026-02 — Phase 2: Custom Affirmation/Sacrifice + Notification System Overhaul (Sections 4-6)**
- Backend: added `affirmation_custom: Optional[str]` to `Manifestation`/`ManifestationCreate` —
  a user-written custom affirmation always takes priority over the stock per-category library
  text everywhere affirmations are shown.
- `manifest-setup.tsx`: added a "Custom Affirmation" toggle ABOVE the Language row (premium-only,
  only visible when the main Affirmations toggle is ON) — off by default for everyone including
  a custom goal (per user's clarification). Enabling it reveals a text input and hides the
  Language row (custom text fully replaces the language-based default, never shown together);
  leaving it empty blocks proceeding (mandatory once enabled) via `canProceed`.
  `(tabs)/home.tsx` and `ritual-reminder.tsx` both prefer `affirmation_custom` over the
  `/affirmations/{category}` API call whenever it's set. Custom sacrifice display was already
  correctly implemented everywhere from the original import (Home, GardenDetail) — extended to
  the new `ritual-reminder.tsx` content as well.
- Notification overhaul: removed the 🕉️ (Om) symbol from the ritual notification title (now
  "✨ Your Daily Ritual Awaits") — grepped the whole codebase, confirmed no other occurrences.
  Fixed two real, code-verified bugs: (1) **"endless splash screen"** — `_layout.tsx`'s
  `markColdStartNavigationHandled()` was being called unconditionally for ANY cold-start
  notification tap, even ones with no screen of their own to open (e.g. the streak reminder) —
  this told the splash screen to permanently skip its own auth-based redirect while nothing else
  navigated away either, stranding the user on the splash screen forever. Now only latched when
  `data.type === "ritual-reminder"`, the one case that actually does navigate. (2) **"wrong
  deity flash"** — `ritual-reminder.tsx` rendered using `user` from `useAuth()` without waiting
  for `authLoading`, so on a cold start it could briefly show the DEFAULT deity before the real
  one loaded a moment later; now gated on `loading || authLoading` together, showing a neutral
  spinner until the real deity is known. Also rewrote the reminder card's content per spec:
  "Take deep breaths, then chant in mind:" → affirmation → "Chant affirmation 10 times in mind"
  (bold) → a boxed, bold sacrifice chant "I am sacrificing X to get Y" + "Don't forget the goal
  and don't give up on X" + "Chant this 10 times too, then begin".
- `scheduleStreakReminder(time, ritualDoneToday)` rewritten from a repeating daily trigger to a
  self-correcting ONE-SHOT `DATE` trigger (device-local `Date`/`setHours`, never server/UTC
  time) — re-derives its target date every time it's called: pushed to tomorrow evening if
  `ritualDoneToday` or if `time` already passed today, otherwise stays tonight. Called from
  `home.tsx`'s `load()` on every Home visit (self-corrects continuously) and immediately after
  `finishRitual()` completes (pushes to tomorrow the instant today's ritual is done) — this is
  how a purely local (no server push) notification can still correctly "skip today if already
  done" without a background task.
- `ReminderCenter.tsx`: moved the "Save Changes" button out of the scrollable content into a
  fixed footer — always visible regardless of scroll position (was previously reachable only by
  scrolling all the way down).
- Verified via testing agent: zero bugs found across backend API round-trip, full manifest-setup
  custom-affirmation flow (toggle/validation/hide-language-row), Home custom-affirmation display,
  direct `/ritual-reminder` navigation (spinner → correct deity → new chant content), Reminder
  Center's fixed footer, and full Phase 1 + Phase 2 regression (zero new backend failures beyond
  documented baseline, zero false logouts, zero console errors).
- **Still deferred**: Section 7-12 — home screen layout (bigger deity card, skeleton loader,
  pre/post-selection states), hold-to-manifest card content replacement, onboarding flow fixes
  (Describe page move, keyboard overlap, card sizing), new 4th "Ritual" tab, Help/FAQ page,
  Contact/ticket system + admin reply UI, manifestation wall timer persistence fix.

**2026-07-20 — Re-imported into a new pod from mtreev5 repo**
- Fresh `git clone` of `https://github.com/clayjohnson706-art/mtreev5` (rsync'd into `/app`,
  excluding `.git`, `.emergent`, `node_modules`, `.env` files to preserve pod-specific config).
  Fresh empty MongoDB in this pod (no real user data yet).
- Installed backend (`pip install -r requirements.txt`) + frontend (`yarn install`) deps.
- backend/.env: added `ENABLE_DEV_LOGIN=true` and `ADMIN_EMAILS=nextleveldev706@gmail.com` so
  dev-login/admin panel work in this pod (values match original PRD history).
- Verified via testing agent: 103/151 pytest passing (8 skipped, 45 admin-panel test errors
  expected — they require the real admin account to log in once via Google OAuth in this fresh
  pod first, not a regression). Full frontend E2E walkthrough passed (onboarding → deity →
  profile-setup → manifest-setup → Home → Hold-to-Manifest ritual verified correct → Settings →
  Community Wall), no crashes. Minor doc-only fix: `test_credentials.md` corrected to show
  dev-login takes query params, not a JSON body. Test data cleaned up post-test.
- User's stated intent: import as-is first, review, then request new features next.

**2026-07-20 (Re-import into new pod, this session) — Imported from mtreev6**
- Fresh `git clone` of `https://github.com/clayjohnson706-art/mtreev6` (rsync'd into `/app`,
  excluding `.git`, `.emergent`, `node_modules`, `.env` files to preserve pod-specific config).
  Fresh empty MongoDB in this pod. Installed backend deps (already matched requirements.txt)
  and new frontend deps via `yarn expo install` (`@gorhom/bottom-sheet`,
  `@react-native-community/datetimepicker`, `expo-localization`, `expo-notifications`,
  `expo-sharing`, `react-native-svg`, `react-native-view-shot`, `html2canvas`).
  `backend/.env`: added `ENABLE_DEV_LOGIN=true`, `ADMIN_EMAILS=nextleveldev706@gmail.com`.
- Testing agent: 105/105 non-admin-gated backend pytest passing (45 admin-panel test errors
  expected — require the real admin to sign in once via Google OAuth in this fresh pod, not a
  regression). Full frontend E2E via dev-login bypass: auth → onboarding → deity → profile-setup
  → manifest-setup → Home → performed real Hold-to-Manifest ritual (streak persisted correctly)
  → Settings → Community Wall. No crashes.
- Fixed 2 low-priority cosmetic issues found by testing agent: (1) `profile-setup.tsx` now
  re-syncs name/gender/dob/country via `useEffect` when `user` resolves asynchronously after
  mount (previously only read once at mount, missed on deep-link/fast-reload); (2)
  `settings.tsx` `rowValue` style changed from a percentage `maxWidth` (which computed oddly
  inside an un-sized nested wrapper View) to `flexShrink` + `textAlign:"right"`, fixing
  unnecessary truncation of the Name row value.
- User's stated intent: import as-is first, review, then request new features next.

**2026-07-20 — Bug fix: onboarding "Next"/"Continue" button unresponsive on real Android device**
- User report (Expo Go, brand-new install, real Android phone): stuck on onboarding slide 1
  ("Set Your Goal"), tapping "Next" did nothing at all. Screenshot confirmed.
- Root cause (confirmed via web research): known React Native New Architecture regression
  (RN #51621, Reanimated #5977) — `TouchableOpacity`'s `onPress` (fires on touch-release) can
  silently stop responding on Android when nearby continuously-animating Reanimated views are
  present. Every onboarding/auth/etc. screen renders `<AnimatedBackground>` (infinite
  `withRepeat` blob/star animations) behind the button — exact trigger condition. App has
  `newArchEnabled: true` + Reanimated v4 + react-native-worklets, matching the regression's
  requirements. Not reproducible on web (onPress fires fine there).
- Fix: `FilledButton` + `GhostButton` (`src/components/ui.tsx`, used app-wide for primary CTAs)
  and the raw "Skip" button (`onboarding.tsx`) now wire their `onPress` prop to the
  `TouchableOpacity`'s `onPressIn` (fires on touch-down, unaffected by the regression) — the
  officially recommended workaround. `Chip` deliberately left untouched (used inside
  horizontal-scrolling category pickers elsewhere; `onPressIn` there risks misfiring during
  scroll gestures — out of scope for this bug).
- Verified via testing agent (realistic press-and-hold-then-release simulation, since instant
  `.click()` doesn't trigger `onPressIn` on RN Web — a Playwright-only artifact, not a real-user
  issue): full onboarding (6 slides) → paywall → deity → profile-setup flow works, no
  double-fire on rapid double-tap, no regression on untouched Chip components.
- **Follow-up**: user reported the exact same symptom persisting after the above fix (no splash,
  no auth screen, straight to onboarding, every single time, even after a fresh QR rescan).
  Added a defensive fix in `_layout.tsx`: explicit `initialRouteName="index"` + explicit
  `<Stack.Screen name="index" />` on the root `<Stack>` (previously only `onboarding` and
  `profile-setup` were explicitly declared as children, which was a latent ambiguity risk for
  the navigator's initial route resolution). Testing agent re-verified full flow end-to-end with
  no regressions (cold load correctly lands on `/auth`).
  **Actual root cause (confirmed by user): a stale/corrupted Expo Go client cache on their
  phone** — fully uninstalling and reinstalling the Expo Go app itself (not just clearing the
  in-app QR/rescan) resolved it completely. Not a code bug. The `initialRouteName` change
  remains in the codebase as a harmless defensive safeguard.

**2026-02 — Re-imported into a new pod from mtreev7 repo**
- Fresh `git clone` of `https://github.com/clayjohnson706-art/mtreev7` (public repo), imported
  verbatim into this pod via `rsync` (excluded `.git`, `.emergent`, `node_modules`, `.env` files
  to preserve pod-specific config). Fresh empty MongoDB in this pod.
- Installed backend (`pip install -r requirements.txt`) + frontend (`yarn install`) deps.
  `backend/.env`: added `ENABLE_DEV_LOGIN=true`, `ADMIN_EMAILS=nextleveldev706@gmail.com`.
- Testing agent verified: 133/148 non-admin backend pytest passing (45 admin-gated test errors
  expected in a fresh pod with no real admin OAuth session — not a regression; 15 stale test
  failures are a test-suite maintenance item unrelated to app correctness — the wall's
  test-account-exclusion behavior is working as intended). Full frontend E2E: auth → onboarding
  → deity → profile-setup → manifest-setup → Home → Journey Cards overlay → Hold-to-Manifest
  ritual (streak 0→1 verified) → Settings → Community Wall → Saved → Subscription (Premium
  Active). Zero console errors/crashes. Verdict: import is complete and fully functional.
- User's stated intent: import as-is and confirm completeness; no new features requested yet.


**2026-02 — Re-imported into a new pod from mtreev8 repo**
- Fresh `git clone` of `https://github.com/clayjohnson706-art/mtreev8` (public repo), imported
  verbatim into this pod via `rsync` (excluded `.git`, `.emergent`, `node_modules`, `.env` files
  to preserve pod-specific config). Fresh empty MongoDB in this pod.
- Installed backend (`pip install -r requirements.txt`, already satisfied) + frontend
  (`yarn install`) deps. `backend/.env`: added `ENABLE_DEV_LOGIN=true`,
  `ADMIN_EMAILS=nextleveldev706@gmail.com`, `GOOGLE_WEB_CLIENT_ID=...` (carried over from repo
  history per user's explicit choice). `frontend/.env`: added
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...`. Updated `/app/memory/test_credentials.md` with
  dev-login usage, admin email, and native Google Sign-In credentials/known-APK-SHA-1.
- Testing agent verified: added `backend/tests/test_v8_import_smoke.py` (10/10 passing) covering
  health, dev-login gating, profile update, manifestation create/ritual/duplicate-day-guard,
  subscribe stub, wall, tickets, notifications. Full suite: 152 passed / 20 failed (pre-existing
  stale-data-assumption tests, fresh empty DB) / 51 errors (all admin-OAuth-gated, expected) / 8
  skipped — zero new backend regressions. Full frontend E2E via Playwright: auth screen →
  onboarding (6 slides) → deity → profile-setup → manifest-setup (9-step wizard) → Journey Cards
  overlay → Hold-to-Manifest ritual (verified early-release does NOT complete it, full hold DOES,
  streak 0→1) → all 4 tabs (Home/Wall/Ritual/Me) → Settings → Help FAQ → Contact/ticket creation
  → Notifications bell. Zero crashes, zero regressions. Verdict: import complete and fully

**2026-02 — Round 3 bug-fix pass (6 groups, previously reported 2-3x each)**
- Group A (Ritual tab): centered all card text (affirmBigText/mutedText/sacrificeBold/deityName
  → textAlign:center); pre-selection state now shows ZERO buttons — removed "Begin New
  Manifestation" + "Contact Us", replaced with bold `ritual-goto-home-message` text; redesigned
  pre-selection philosophy section into a 6-step numbered/connected visual journey
  (`ritual-philosophy-journey`: Clear Goal → Sacrifice → Mind Link → Consistency → More Power →
  Daily Hustle). New backend endpoint `GET /api/ui-strings?language=X` (data/ui_strings_i18n.json,
  53 languages, generated once via `generate_ui_strings_i18n.py` using Claude Sonnet 4.6 +
  Emergent LLM key) now drives the sacrifice-template/chant-instructions/"take deep
  breaths"/"don't give up on sacrifice" text in the selected language on Ritual tab, Home's
  ritual-success + streak-success modals, and ritual-reminder.tsx (push-notification tap screen).
  {{SACRIFICE}}/{{GOAL}} tokens inside the sacrifice template stay in English (no per-category
  translation data yet) — documented, by design.
- Group B (Home): `DeityHero` gained a `boost` prop (reanimated shared value) — deity glow now
  dramatically intensifies (opacity/scale boost on all 4 glow layers) while holding
  "Hold to Start"/"Hold to Add Power", driven by the existing `energyGlow` value. Home's
  logo+settings header moved outside the ScrollView into a sticky `home-sticky-header`. Unified
  `home-top-skeleton` now covers moon/cosmic cards + deity hero + goal/sacrifice row together
  (previously only goal/sacrifice had a skeleton) — pixel-matched sizes, no layout shift. Wall
  tab's plain "Loading..." text replaced with 3 sized skeleton cards (`wall-skeleton`).
- Group C (Tabs): Rewrote `SwipeNav.tsx` — root-caused the repeated "shake on tab tap" to
  screens staying mounted at their last resting position (translateX=0, opacity=1) and only
  jumping to the enter-offset AFTER already being shown again on refocus (a visible
  snap-then-slide). Fixed by parking translateX/opacity at an invisible off-screen state on
  BLUR (while still on top, still visible) instead of on FOCUS — so the jump always happens
  while already invisible, and focus only ever plays a clean withTiming slide+fade (260ms).
- Group D (Settings): Sign-out changed from tap→confirm-dialog to true "Hold to Sign Out" — a

**2026-02 — Critical bug fix: Home going blank after leaving/returning + full category-name
translation**
- Bug 1 (critical): `SwipeNav.tsx`'s blur/focus logic (from the Round 3 shake fix) only handled
  tab-to-tab transitions; navigating Home → a non-tab stack screen (manifest-setup's
  goal/sacrifice picker, /settings, etc.) → back to Home left it permanently parked at
  opacity:0 (invisible) since `prevIdx === currIdx` skipped both focus-effect branches. Fixed
  with a new `else` branch that fades back to visible on any same-tab refocus.
- Bug 2: goal/sacrifice CATEGORY NAMES (e.g. "Wealth", "Junk Food") inside the sacrifice-
  affirmation sentence were not translated (only the surrounding template words were, from the
  previous round). Added `GET /api/category-labels?language=X` (data/category_labels_i18n.json,
  all 72 goal+sacrifice category keys × 53 languages, generated via Claude Sonnet 4.6) and wired
  translated labels into `fillSacrificeTemplate` calls in home.tsx/ritual.tsx/ritual-
  reminder.tsx — other UI spots (cards/chips) intentionally stay English, unchanged.
- Testing agent verified both fixes live (exact repro flows) — zero regressions, zero new bugs.

  ~2.4s press-and-hold with a Reanimated progress-fill bar; release early cancels; scroll-through
  touches can never complete it (onPressOut fires well before the fill finishes).
- Group E (Profile/Me tab): audited — "Help" + exact "Contact Us" labels were already correct
  in code; no change needed.
- Group F (Text): Goal category label "Money" → "Wealth" (backend key stays `money`, no data
  migration); onboarding copy "money" → "wealth"; affirmations_i18n.json English "money" source
  → "wealth"; "Don't forget the goal and don't give up on {sacrificeLabel}" → static "...don't
  give up on sacrifice" (literal word, no longer interpolates the actual sacrifice item name) on
  Ritual tab + Home's two success modals.
- Testing agent verified all 6 groups live via Playwright + backend curl/pytest — zero bugs
  found, no code changes needed from the test pass itself.

  functional.
- User's stated intent: import as-is and confirm completeness; no new features requested yet.

---
## Update — June 2026 (Deep UI Overhaul + Web Admin Dashboard)
Original ask: undo half-done changes, deep stunning dark/gold design overhaul, all 18 spec features working, butter-smooth animations. Testing phase: EVERYTHING FREE (ads off, subscriptions off, community free).

### Done (this iteration)
- Pulled latest repo code; fixed build-breaking syntax error (NotificationStreakCard) and setActive crash (ritual.tsx)
- Theme refresh: obsidian palette (#05050C void, refined surfaces, warmer white) applied app-wide via COLORS tokens
- New glass-pill bottom tab bar (expo-blur, labels, haptics, Reanimated glow/scale)
- HoldProgressButton rewritten on Reanimated UI thread + haptics (60fps fill)
- Ritual tab: combined "Your Sacred Commitment" card (Burning Desire → Affirmation → Sacrifice, ultra-visible) + HOW TO PRACTICE chant card
- §18: removed in-app admin panel (app/admin.tsx + settings link); new password-protected web admin dashboard at /api/admin-dashboard (ADMIN_PASSWORD in backend/.env, POST /api/admin/login, 12h TTL sessions) — stats, users→ticket history/active ticket/reply/close, block/premium toggles, pricing + feature flags, test users excluded from tickets
- New config flag community_premium_required (default false = community free); wall/leaderboard/save endpoints + frontend gate respect it
- All backend + frontend tests pass (test_reports/iteration_1.json)

### Config / credentials
- Admin dashboard: {BACKEND_URL}/api/admin-dashboard, password MTree@Sacred#2026
- ENABLE_DEV_LOGIN=true in backend/.env (preview testing) — set false for production
- Flags to flip at launch (via admin dashboard): ads_enabled, subscriptions_enabled, community_premium_required

### Next / P1
- Real AdMob + Play Billing (RevenueCat) activation when live on Play Store
- Native-device QA of alarm-style wake/sleep notifications + hold-to-done (requires production build)
- Optional: migrate deprecated shadow*/pointerEvents style props (web-only warnings)

---
## Update — June 2026 (12-Section UI Overhaul & Bug Fixes)
- §1 Full design overhaul: deep purple/midnight palette, glass Card component (hairline border, sheen gradient, ambient shadow), gradient gold buttons, press-scale micro-animations everywhere
- §11 Typography: Nunito (global, readable) + Lora serif for ALL affirmation text (centered, 20sp, 1.5x line height) — loaded via expo-font local assets (removed @expo-google-fonts usage)
- §4 Home header: transparent, scrolls with content (no black bar)
- §5/§6 Streak Hub redesign: animated SVG progress ring, pulsing flame, 7/21/40-day bronze/silver/gold milestone badges; streaks placed ABOVE affirmation; hold-to-mark removed from home (only in /ritual-reminder notification card)
- §2 Manifest-setup summary now shows GOAL + HUSTLE + FASTING
- §3 Journey intro overlay: new "Came True" importance card (index 4) with golden button visual + horizontal slide transitions
- §8 Ritual "How to Practice": 5 rich guidance rows (mental chanting 10x, wake-up/bedtime power, consistency, visualization)
- §9 Tab transitions: navigator animation:"shift" (spring) + simplified SwipeNav (no opacity parking) — flicker fixed
- §10 Everything free: paywall.tsx/subscription.tsx deleted, all premium gates/locks removed from Settings/Wall/Saved; Reminder & Language rows open their real sheets
- §12 Daily reminder custom time picker verified working
- Tests: /app/test_reports/iteration_2.json — all pass

---
## Update — June 2026 (Alignment, Notification Card, Alarms & Login Fixes)
- §1 Burning Desire + Sacrifice now center-aligned everywhere (SacredCommitmentCard rows + manifest-setup summary) — identical treatment to affirmation
- §2 "Chant this in your mind 10 times" pill on all notification cards (reminder/wake/sleep kinds)
- §3 Streak reminder switched to DAILY repeating trigger (survives restarts); random reminders code-verified (avoid alarm windows); wake/sleep alarms: MAX-importance channel + expo-audio LOOPING alarm sound in ritual-reminder screen, stops ONLY on HOLD TO STOP (bundled assets/sounds/alarm.wav; needs native build to hear)
- §4 Google login button: Material-You dark tonal pill (surface bg, gold border, white G chip) — white background removed
- expo-audio installed; tests: /app/test_reports/iteration_3.json — all pass
