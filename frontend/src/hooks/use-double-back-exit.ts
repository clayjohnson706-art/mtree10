import { useCallback, useRef } from "react";
import { BackHandler, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSharedValue, withTiming, useAnimatedStyle } from "react-native-reanimated";

const EXIT_WINDOW_MS = 2000;

// Double-back-to-exit for TOP-LEVEL screens only (the 3 main tabs: Home, Wall, Me) — hardware
// Back on these should never navigate anywhere (there's nowhere meaningful to go), it should
// exit the app, but only after a confirming second press within EXIT_WINDOW_MS so a single
// accidental press doesn't kill the app. Deliberately NOT used on onboarding/auth/nested
// pushed screens, where Back must keep navigating normally (those already have their own
// specific back handling, e.g. onboarding.tsx's first-slide exit prompt).
//
// Usage:
//   const { toastStyle } = useDoubleBackExit();
//   <Animated.View pointerEvents="none" style={[styles.exitToast, toastStyle]}>
//     <Text>Press back again to exit</Text>
//   </Animated.View>
export function useDoubleBackExit(enabled: boolean = true) {
  const backPressedOnceRef = useRef(false);
  const toastOpacity = useSharedValue(0);

  // NOTE: Deliberately using ONLY our own branded animated toast (below), not the native
  // ToastAndroid — showing both at once looked like two separate/duplicate "exit" prompts.
  const showExitToast = useCallback(() => {
    toastOpacity.value = withTiming(1, { duration: 150 });
    setTimeout(() => {
      toastOpacity.value = withTiming(0, { duration: 300 });
    }, EXIT_WINDOW_MS - 200);
  }, [toastOpacity]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || Platform.OS !== "android") return;
      const onBackPress = () => {
        if (backPressedOnceRef.current) {
          BackHandler.exitApp();
          return true;
        }
        backPressedOnceRef.current = true;
        showExitToast();
        setTimeout(() => { backPressedOnceRef.current = false; }, EXIT_WINDOW_MS);
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [enabled, showExitToast])
  );

  const toastStyle = useAnimatedStyle(() => ({ opacity: toastOpacity.value }));
  return { toastStyle };
}
