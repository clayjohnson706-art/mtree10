import React, { useRef } from "react";
import { ViewStyle, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { useNavigation, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

// Swipe navigation wrapper — live 1:1 finger tracking. The actual page transition (both for
// tab-bar taps AND swipe commits) is rendered by the tabs navigator's built-in `shift`
// animation (see app/(tabs)/_layout.tsx), so this wrapper does NO enter/exit/opacity work of
// its own anymore — that double-animation (park-invisible-on-blur + fade-slide-on-focus) was
// the source of the reported flicker/"glitter" on tab switches. One animation system now owns
// the transition end-to-end, matching the onboarding pager's single continuous slide feel.
const ORDER: Array<"home" | "wall" | "ritual" | "me"> = ["home", "ritual", "wall", "me"];
const { width: SCREEN_W } = Dimensions.get("window");
const SPRING = { damping: 26, stiffness: 300, mass: 0.55 };

export default function SwipeNav({
  screen,
  children,
  style,
}: {
  screen: "home" | "wall" | "ritual" | "me";
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const navigation = useNavigation();
  const translateX = useSharedValue(0);
  // Hard lock against duplicate/overlapping navigation dispatches from rapid flicks.
  const isNavigatingRef = useRef(false);

  useFocusEffect(
    React.useCallback(() => {
      isNavigatingRef.current = false;
      translateX.value = 0;
    }, [translateX])
  );

  const idx = ORDER.indexOf(screen);
  const nextTab = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  const prevTab = idx > 0 ? ORDER[idx - 1] : null;

  const goTo = (t: "home" | "wall" | "ritual" | "me") => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    // Local tabs navigator (same mechanism as the tab bar's own press) — can never push a
    // stray duplicate onto the root stack however rapidly it's called.
    (navigation as any).navigate(t);
    setTimeout(() => { isNavigatingRef.current = false; }, 500);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      if (isNavigatingRef.current) return;
      // Live finger-follow with rubber-band resistance at the outer edges.
      let tx = e.translationX;
      if (tx < 0 && !nextTab) tx *= 0.25;
      if (tx > 0 && !prevTab) tx *= 0.25;
      // Soften even valid drags slightly — the navigator's shift animation does the real
      // page movement on commit; this is just responsive finger feedback.
      translateX.value = tx * 0.55;
    })
    .onEnd((e) => {
      if (isNavigatingRef.current) return;
      const { translationX, velocityX } = e;
      const commitNext = (translationX < -SCREEN_W * 0.18 || velocityX < -650) && nextTab;
      const commitPrev = (translationX > SCREEN_W * 0.18 || velocityX > 650) && prevTab;
      // Spring home immediately in ALL cases; on commit, hand off to the navigator's shift
      // transition in the same frame — one continuous motion, no dead gap.
      translateX.value = withSpring(0, SPRING);
      if (commitNext) runOnJS(goTo)(nextTab as any);
      else if (commitPrev) runOnJS(goTo)(prevTab as any);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
