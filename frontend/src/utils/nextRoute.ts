import type { User } from "@/src/context/AuthContext";

/**
 * Central decision for where the app should route a user, based on onboarding progress.
 * Used by the cold-start splash (index.tsx) AND by any screen (e.g. auth.tsx) that needs to
 * jump straight to the right destination WITHOUT bouncing back through the splash screen.
 */
export function getNextRoute(user: User | null): string {
  if (!user) return "/auth";
  if (!user.onboarding_done) return "/onboarding";
  if (!user.profile_done) return "/profile-setup";
  if (!user.deity_id) return "/manifest-setup";
  return "/(tabs)/home";
}
