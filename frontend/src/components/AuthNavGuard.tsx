import { useEffect, useRef } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";

// Root-level safety net for authentication/navigation consistency. Mounted ONCE at the top of
// the app (in app/_layout.tsx), for the app's entire lifetime.
//
// What this guarantees:
// 1. The ONLY thing that can make this component act is a CONFIRMED transition from
//    "was authenticated" -> "now signed out" (a real signOut()/deleteAccount() call, or a
//    server-confirmed invalid/expired/blocked session per AuthContext's hardened refresh()
//    logic — never a transient glitch, and never the initial not-yet-loaded state).
// 2. When that happens, it unconditionally clears EVERY authenticated screen out of the
//    navigation stack (dismissAll) and lands directly on /auth — so the hardware/gesture Back
//    button can never resurface a stale authenticated screen (Settings, Home, etc.), and the
//    splash screen never flashes in between.
// 3. It NEVER fires while the user is still authenticated, and never fires on cold start before
//    the very first successful sign-in of this session — that initial routing is owned by the
//    splash screen (app/index.tsx) and the normal onboarding flow, which this deliberately does
//    not interfere with.
export default function AuthNavGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      wasAuthenticatedRef.current = true;
      return;
    }
    // user === null and loading is done.
    if (!wasAuthenticatedRef.current) return; // never signed in yet this session — not our job.
    if (segments[0] === "auth") return; // already there, nothing to do.
    wasAuthenticatedRef.current = false; // one-shot: don't re-fire on every subsequent render.
    router.dismissAll();
    router.replace("/auth");
  }, [user, loading, segments, router]);

  return null;
}
