// Tracks whether something has ALREADY explicitly navigated the app during this cold start
// (right now: tapping a ritual-reminder notification to launch the app). The splash screen
// (app/index.tsx) waits ~2.2s before deciding where to route the user, purely based on their
// onboarding/auth state — it has no idea a notification tap already pushed a different screen
// on top of it in the meantime. Without this flag, the splash timer fires anyway and calls
// router.replace(), which replaces whatever is currently focused (the just-opened
// ritual-reminder screen) with Home — so the notification's affirmation card appears, then
// silently gets swapped out for Home ~2 seconds later, reading as "the card closes itself".
let handled = false;

export function markColdStartNavigationHandled() {
  handled = true;
}

export function isColdStartNavigationHandled(): boolean {
  return handled;
}
