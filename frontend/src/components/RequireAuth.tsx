import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS } from "@/src/theme";

// Guarantees the wrapped authenticated-only screen(s) are NEVER rendered without a valid
// session — closes the brief render-before-effect-redirect gap where protected content could
// otherwise flash on screen with `user === null` for a frame (e.g. right after a genuine
// logout, before AuthNavGuard's effect has finished navigating away). Renders a neutral loading
// state instead of the real content whenever there isn't a confirmed, loaded user.
//
// IMPORTANT: this component owns its OWN redirect-to-/auth fallback (below) rather than relying
// solely on the root-level AuthNavGuard. AuthNavGuard only reacts to a LIVE authenticated->null
// transition — it deliberately does nothing if the app is *already* unauthenticated when a
// protected screen is reached directly (e.g. pressing hardware/browser Back after a sign-out
// that already completed, a deep link, or a fresh session with no token at all landing straight
// on a protected route). Without its own fallback, this component would otherwise show its
// loading spinner FOREVER in exactly those cases. This makes every screen wrapped here
// self-sufficient: it can never get stuck showing protected content OR a permanent spinner.
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Latest `user` value, readable from inside the setTimeout below without a stale closure.
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    if (loading || user) return;
    // 300ms stabilization window: don't act on the very first instant `user` reads null — wait
    // briefly, then re-check the LATEST value (via the ref above) before actually clearing the
    // nav stack. If `user` is populated again by the time this fires, it was a transient blip
    // and this is a no-op. A genuine logout's `user` stays null past this window regardless, so
    // the real redirect still happens — just ~300ms later.
    const timeout = setTimeout(() => {
      if (userRef.current) return; // recovered in the meantime — false alarm, do nothing.
      router.dismissAll();
      router.replace("/auth");
    }, 300);
    return () => clearTimeout(timeout);
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <View style={styles.loading} testID="require-auth-loading">
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: COLORS.void, alignItems: "center", justifyContent: "center" },
});
