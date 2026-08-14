import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, Platform, Text, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { ManifestationProvider } from "@/src/context/ManifestationContext";
import { AppConfigProvider } from "@/src/context/AppConfigContext";
import AuthNavGuard from "@/src/components/AuthNavGuard";
import { COLORS } from "@/src/theme";
import { notificationsAvailable } from "@/src/utils/notifications";
import { markColdStartNavigationHandled } from "@/src/utils/coldStartNav";
import { useFonts, Manrope_400Regular } from "@expo-google-fonts/manrope";

const globalFontStyle = { fontFamily: "Manrope_400Regular" };
(Text as any).defaultProps = { ...(Text as any).defaultProps, style: [globalFontStyle, (Text as any).defaultProps?.style] };
(TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, style: [globalFontStyle, (TextInput as any).defaultProps?.style] };

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [fontLoaded, fontError] = useFonts({ Manrope_400Regular });
  const router = useRouter();

  useEffect(() => {
    if ((loaded || error) && (fontLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, fontLoaded, fontError]);

  // Tapping a daily ritual reminder notification opens a calming popup before Home —
  // handles both the app-already-running case and cold start (app opened via the tap).
  // Local notifications are a native-only feature (not supported on web, and unavailable in
  // Expo Go on Android per notificationsAvailable()) — fully functional in a real build.
  useEffect(() => {
    if (Platform.OS === "web" || !notificationsAvailable()) return;
    let sub: { remove: () => void } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require("expo-notifications");
      const openIfRitualReminder = (data: any) => {
        if (data?.type === "ritual-reminder") {
          router.push({
            pathname: "/ritual-reminder",
            params: { kind: String(data.kind || "reminder"), eventId: String(data.eventId || "reminder") },
          });
        }
      };
      sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
        openIfRitualReminder(response.notification.request.content.data);
      });
      Notifications.getLastNotificationResponseAsync()
        .then((response: any) => {
          const data = response?.notification?.request?.content?.data;
          // CRITICAL: only latch "handled" (which tells the splash screen to skip its OWN
          // auth-based redirect) when we're ACTUALLY about to navigate somewhere ourselves.
          // Calling markColdStartNavigationHandled() unconditionally for ANY notification tap
          // (e.g. the daily streak reminder, which has no screen of its own to open) was the
          // root cause of the "endless splash screen" bug: the splash was told "something else
          // is handling navigation" and permanently skipped its own redirect, while nothing
          // else navigated away either — stranding the user on the splash screen forever.
          if (data?.type === "ritual-reminder") {
            markColdStartNavigationHandled();
            openIfRitualReminder(data);
          }
        })
        .catch(() => {});
    } catch {}
    return () => sub?.remove();
  }, [router]);

  if ((!loaded && !error) || (!fontLoaded && !fontError)) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.void }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppConfigProvider>
          <ManifestationProvider>
          <BottomSheetModalProvider>
            {/* Root-level safety net: guarantees a confirmed logout always clears the entire
                navigation stack and lands directly on /auth (see AuthNavGuard for details). */}
            <AuthNavGuard />
            <StatusBar barStyle="light-content" backgroundColor={COLORS.void} />
            <Stack
              initialRouteName="index"
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.void } }}
            >
              {/* Explicit initial route — cold start must always land on the splash screen
                  (which then decides auth/onboarding/home), never directly on any other screen. */}
              <Stack.Screen name="index" />
              {/* Mandatory setup screens — disable the iOS interactive swipe-back gesture so it
                  can't bypass onboarding the same way the Android hardware back button could
                  (handled via BackHandler inside each screen). */}
              <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
              <Stack.Screen name="profile-setup" options={{ gestureEnabled: false }} />
            </Stack>
          </BottomSheetModalProvider>
          </ManifestationProvider>
          </AppConfigProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
