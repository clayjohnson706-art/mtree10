import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api, clearToken, getToken, saveToken } from "@/src/utils/api";
import { rescheduleReminders, scheduleStreakReminder, cancelStreakReminder, scheduleWakeSleepAlarms } from "@/src/utils/notifications";
import { nativeGoogleSignInAvailable, signInWithGoogleNative, signOutGoogleNative } from "@/src/utils/googleAuth";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  gender?: string;
  dob?: string;
  deity_id?: number | null;
  country?: string | null;
  is_public: boolean;
  is_premium: boolean;
  premium_expires_at?: string | null;
  affirmation_language: string;
  notification_count: number;
  notification_busy_start?: string | null;
  notification_busy_end?: string | null;
  busy_hours_enabled?: boolean;
  reminder_mode?: string;
  reminder_times?: string[];
  wake_alarm_enabled?: boolean;
  wake_alarm_time?: string;
  sleep_alarm_enabled?: boolean;
  sleep_alarm_time?: string;
  streak_reminder_enabled?: boolean;
  streak_reminder_time?: string;
  onboarding_done: boolean;
  profile_done: boolean;
  tour_done: boolean;
  journey_intro_seen?: boolean;
  is_admin?: boolean;
  is_blocked?: boolean;
  blocked_until?: string | null;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  blockedMessage: string | null;
  clearBlockedMessage: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (u: Partial<User>) => Promise<User>;
  subscribe: (plan: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as any);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const clearBlockedMessage = useCallback(() => setBlockedMessage(null), []);

  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    // De-dupe concurrent calls: rapid tab switching can trigger several screens' focus effects
    // firing refresh()-adjacent auth checks in the same tick. Without this guard, overlapping
    // /auth/me requests can resolve out of order and clobber each other's state.
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const run = async () => {
      try {
        const token = await getToken();
        if (!token) { setUser(null); return; }
        const u = await api<User>("/auth/me");
        setUser(u);
      } catch (e: any) {
        const status: number | undefined = e?.status;
        // Only a definitive rejection from the server (401 = invalid/expired session, 403 = blocked
        // account) should ever sign the user out and wipe their stored token. Any other failure —
        // a dropped connection, a slow/cold-starting backend, a one-off 5xx — is transient and must
        // NOT destroy a still-valid session. Otherwise a single network blip permanently logs the
        // user out (they'd be stuck on the login screen on every subsequent app open/refresh until
        // they sign back in), which is exactly the "kicked to login" bug this guards against.
        if (status === 401 || status === 403) {
          // IMPORTANT: don't trust a single 401/403 immediately. A burst of concurrent requests
          // (e.g. several screens' data-loading effects firing together during rapid tab
          // swiping) can occasionally hit a TRANSIENT local secure-storage read glitch — the
          // token is genuinely still there, but that one particular read momentarily returned
          // nothing, so THIS request went out with no Authorization header and the server
          // correctly (but misleadingly) answered 401. Treating that as "session invalid" would
          // wipe a perfectly good session out from under the user. So: wait briefly, re-check
          // storage, and retry once before concluding the session is actually dead.
          await new Promise((r) => setTimeout(r, 350));
          const retryToken = await getToken();
          if (!retryToken) {
            // No token left locally at all (e.g. a real signOut() ran in the meantime) — this
            // is not a false positive, there's genuinely nothing to be logged into.
            setUser(null);
            return;
          }
          try {
            const u2 = await api<User>("/auth/me");
            setUser(u2); // token was fine all along — false alarm, session recovered silently
            return;
          } catch (e2: any) {
            const status2: number | undefined = e2?.status;
            if (status2 === 401 || status2 === 403) {
              // Confirmed on retry (with a token verified present) — this is a genuine
              // server-side session invalidation/expiry/block, not a local storage hiccup.
              await clearToken();
              setUser(null);
              if (status2 === 403 && typeof e2?.message === "string" && e2.message.toLowerCase().includes("blocked")) {
                setBlockedMessage("Your account has been blocked. Contact support if you think this is a mistake.");
              }
            } else {
              console.warn("Auth refresh retry failed (transient, session kept):", e2?.message);
            }
          }
        } else {
          console.warn("Auth refresh failed (transient, session kept):", e?.message);
        }
      }
    };

    const p = run().finally(() => {
      refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = p;
    return p;
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    // Handle web redirect with session_id
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : search);
      const sid = params.get("session_id");
      if (sid) {
        try {
          const res = await api<{ session_token: string; user: User }>(
            "/auth/session",
            { method: "POST", body: { session_id: sid }, auth: false }
          );
          await saveToken(res.session_token);
          window.history.replaceState(null, "", window.location.pathname);
          setUser(res.user);
          setLoading(false);
          return;
        } catch (e) {
          console.warn("Session exchange failed", e);
        }
      }
    }
    await refresh();
    setLoading(false);
  }, [refresh]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // Safety net: re-sync the device's locally-scheduled ritual reminders whenever the user's
  // reminder settings change (or on app launch) — covers fresh installs and the rare case the
  // OS drops previously scheduled alarms (e.g. after a device reboot on managed Expo builds).
  const lastScheduledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const key = `${user.notification_count ?? 0}|${user.notification_busy_start ?? ""}|${user.notification_busy_end ?? ""}|${user.reminder_mode ?? "random"}|${(user.reminder_times ?? []).join(",")}|${user.wake_alarm_time ?? "07:00"}|${user.sleep_alarm_time ?? "22:00"}`;
    if (lastScheduledKeyRef.current === key) return;
    lastScheduledKeyRef.current = key;
    rescheduleReminders(
      user.notification_count ?? 0,
      user.notification_busy_start,
      user.notification_busy_end,
      (user.reminder_mode as "random" | "custom") ?? "random",
      user.reminder_times ?? [],
      user.wake_alarm_time ?? "07:00",
      user.sleep_alarm_time ?? "22:00",
    ).catch(() => {});
  }, [user?.notification_count, user?.notification_busy_start, user?.notification_busy_end, user?.reminder_mode, user?.reminder_times, user?.wake_alarm_time, user?.sleep_alarm_time]);

  const lastAlarmKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const key = `${user.wake_alarm_enabled !== false}|${user.wake_alarm_time ?? "07:00"}|${user.sleep_alarm_enabled !== false}|${user.sleep_alarm_time ?? "22:00"}`;
    if (lastAlarmKeyRef.current === key) return;
    lastAlarmKeyRef.current = key;
    scheduleWakeSleepAlarms(
      user.wake_alarm_enabled !== false,
      user.wake_alarm_time ?? "07:00",
      user.sleep_alarm_enabled !== false,
      user.sleep_alarm_time ?? "22:00",
    ).catch(() => {});
  }, [user?.wake_alarm_enabled, user?.wake_alarm_time, user?.sleep_alarm_enabled, user?.sleep_alarm_time]);

  // Same safety-net pattern for the single daily Streak Reminder — re-syncs on launch and
  // whenever the enabled flag or chosen time changes, independent of the ritual-reminder
  // schedule above. Defaults to ON (opt-out, not opt-in): only an EXPLICIT `false` from the
  // backend cancels it, any other value (true/undefined) schedules it.
  const lastStreakKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const enabled = user.streak_reminder_enabled !== false;
    const key = `${enabled}|${user.streak_reminder_time ?? "20:00"}`;
    if (lastStreakKeyRef.current === key) return;
    lastStreakKeyRef.current = key;
    if (enabled) {
      scheduleStreakReminder(user.streak_reminder_time ?? "20:00").catch(() => {});
    } else {
      cancelStreakReminder().catch(() => {});
    }
  }, [user?.streak_reminder_enabled, user?.streak_reminder_time]);

  const signIn = useCallback(async () => {
    // Prefer native 1-tap Google Sign-In (developer's own Google Cloud credentials) when the
    // native module is actually linked — i.e. a real dev/production build, not Expo Go (where
    // the module fails to load and nativeGoogleSignInAvailable() correctly returns false, so
    // this silently falls through to the existing Emergent-managed browser flow below).
    if (nativeGoogleSignInAvailable()) {
      const idToken = await signInWithGoogleNative();
      const res = await api<{ session_token: string; user: User }>(
        "/auth/google",
        { method: "POST", body: { id_token: idToken }, auth: false }
      );
      await saveToken(res.session_token);
      setUser(res.user);
      return;
    }
    const redirectUrl = Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.origin + "/"
      : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type !== "success" || !result.url) return;
    // Parse session_id from result URL
    const url = result.url;
    const hashIdx = url.indexOf("#");
    const qIdx = url.indexOf("?");
    let sid: string | null = null;
    if (hashIdx >= 0) {
      const p = new URLSearchParams(url.slice(hashIdx + 1));
      sid = p.get("session_id");
    }
    if (!sid && qIdx >= 0) {
      const p = new URLSearchParams(url.slice(qIdx + 1));
      sid = p.get("session_id");
    }
    if (!sid) return;
    const res = await api<{ session_token: string; user: User }>(
      "/auth/session",
      { method: "POST", body: { session_id: sid }, auth: false }
    );
    await saveToken(res.session_token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    // Clear the native Google session too — otherwise the next "Continue with Google" tap
    // silently re-signs the user in as the same account instead of offering the account picker.
    await signOutGoogleNative();
    await clearToken();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (u: Partial<User>) => {
    const updated = await api<User>("/profile", { method: "PATCH", body: u });
    setUser(updated);
    return updated;
  }, []);

  const subscribe = useCallback(async (plan: string) => {
    await api("/subscribe", { method: "POST", body: { plan } });
    await refresh();
  }, [refresh]);

  const deleteAccount = useCallback(async () => {
    await api("/account", { method: "DELETE" });
    // Same reasoning as signOut(): without this, the deleted account stays cached in the native
    // module and the next sign-in silently reuses it instead of showing the account picker.
    await signOutGoogleNative();
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, blockedMessage, clearBlockedMessage, signIn, signOut, refresh, updateProfile, subscribe, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}
