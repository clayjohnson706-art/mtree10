import { Platform } from "react-native";

// Native 1-tap Google Sign-In using the developer's own Google Cloud OAuth credentials
// (@react-native-google-signin/google-signin). This is a native module — it is NOT bundled
// into the Expo Go app, so requiring it there throws at import time. Loading it lazily via
// require() inside a try/catch (same defensive pattern used for expo-notifications) means
// that throw is caught here instead of crashing the whole app: every export below becomes a
// safe "unavailable" no-op in Expo Go, while working fully in a real dev/production build
// (generated via the Publish button) where the native module is actually linked.
let GoogleSignin: typeof import("@react-native-google-signin/google-signin").GoogleSignin | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GoogleSignin = require("@react-native-google-signin/google-signin").GoogleSignin;
    GoogleSignin!.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
    });
  } catch {
    GoogleSignin = null;
  }
}

export function nativeGoogleSignInAvailable(): boolean {
  return !!GoogleSignin;
}

/** Runs the native Google Sign-In sheet and returns the Google ID token to verify server-side. */
export async function signInWithGoogleNative(): Promise<string> {
  if (!GoogleSignin) throw new Error("Native Google Sign-In unavailable");
  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }
  let result;
  try {
    result = await GoogleSignin.signIn();
  } catch (err: any) {
    // Surface the native error code (e.g. Android status code 10 = DEVELOPER_ERROR, almost
    // always a SHA-1/package-name mismatch between the signed APK and the Android OAuth
    // client registered in Google Cloud Console) so it's visible in the UI error banner
    // instead of a generic message — critical for diagnosing native sign-in failures, which
    // can only ever happen on a real device/build, never in this preview environment.
    const code = err?.code ?? "unknown";
    throw new Error(`Native Google Sign-In error [code ${code}]: ${err?.message || err}`);
  }
  if (result.type === "cancelled") throw new Error("cancelled");
  const idToken = result.data?.idToken;
  if (!idToken) throw new Error("Missing Google ID token");
  return idToken;
}

// Clears the native module's cached Google session. Without this, GoogleSignin remembers the
// last-used account on-device (that's what makes its normal one-tap re-auth convenient) — so
// after our own signOut()/deleteAccount() the NEXT "Continue with Google" tap would silently
// sign back in as that same account instead of showing the account picker, even though the
// user just explicitly signed out or deleted their account. Calling this makes the account
// chooser appear again on the next sign-in, as it should after a genuine sign-out.
export async function signOutGoogleNative(): Promise<void> {
  if (!GoogleSignin) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // Best-effort: never let a native sign-out hiccup block the app's own sign-out flow.
  }
}
