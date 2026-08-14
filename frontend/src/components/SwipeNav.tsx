import React, { useRef } from "react";
import { ViewStyle, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useNavigation, useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

// Swipe navigation wrapper — live 1:1 finger tracking + spring physics for an effortless,
// native-feeling swipe between tabs. Order: home → ritual → wall → me (Ritual is the
// immediate next tab after Home, so swiping right from Home lands directly on Ritual).
const ORDER: Array<"home" | "wall" | "ritual" | "me"> = ["home", "ritual", "wall", "me"];
const { width: SCREEN_W } = Dimensions.get("window");
const EXIT_DISTANCE = SCREEN_W * 0.3;
// Kept small on purpose — this offset is only ever visible WHILE combined with the opacity
// fade below (see `parked` in the blur handler), never as a sudden position jump on its own.
// A subtle 36px slide reads as "smooth" even on a wide device, unlike the old 22%-of-screen
// offset which produced a visible snap on tab-bar taps (see blur/focus comment below).
const ENTER_OFFSET = 36;
// Snappier, more decisive settle (higher stiffness/damping ratio ≈0.98 — barely any overshoot)
// than before, which felt slightly "sticky"/wobbly on snap-back.
const SPRING = { damping: 26, stiffness: 280, mass: 0.6 };
const TAB_TRANSITION_MS = 260;

// Plain in-memory module variable instead of AsyncStorage — this is purely a same-session
// visual hint ("which tab did I just come from, to pick an enter offset direction") and does
// NOT need persistence across app restarts. Reading/writing AsyncStorage on every single tab
// focus was async (a real bridge round-trip), so the screen would render at translateX=0 for a
// frame or two BEFORE the effect's promise resolved and snapped it to the enter offset — a
// visible flash/glitch on every tab switch. A synchronous module variable removes that gap.
let lastTab: "home" | "wall" | "ritual" | "me" | "" = "";

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
  const translateX = useSharedValue(ENTER_OFFSET);
  const opacity = useSharedValue(0);
  // Hard lock against duplicate/overlapping navigation actions: without this, a fast flick
  // followed by another swipe before the first tab switch has actually completed could fire a
  // SECOND router action while the navigator is still mid-transition from the first — the kind
  // of overlapping/duplicate navigation dispatch that can leave React Navigation's stack in an
  // inconsistent state. Released the moment this screen (or the destination one) next gains
  // focus, with a short timeout fallback as a safety net.
  const isNavigatingRef = useRef(false);

  // --- Tab-bar-tap transition (the "shake" fix) ---------------------------------------------
  // Root cause of the previously-reported shake: React Navigation's bottom-tabs shows/hides
  // tab screens INSTANTLY (no built-in transition), and tab screens stay mounted after their
  // first visit. So on a plain re-focus, the very first frame the user sees is this screen's
  // LAST rendered position (translateX=0, opacity=1 — resting, fully visible, from the last
  // time it finished animating). Only THEN would the old code jump translateX to the enter
  // offset and animate back — a visible snap-then-slide, i.e. the "shake".
  //
  // Fix: do the "jump to the off-screen/invisible parked state" on BLUR (while this screen is
  // still the one on top, still visible for one more instant) instead of on FOCUS (after it's
  // already been shown at rest). By the time it's re-focused, translateX/opacity are ALREADY
  // sitting at the parked values — no synchronous jump needs to happen while visible, so
  // there's nothing to snap. The focus effect below just animates smoothly from wherever it
  // already is back to resting position — a clean slide + fade, every time, both directions.
  useFocusEffect(
    React.useCallback(() => {
      isNavigatingRef.current = false; // this screen is now genuinely focused — release the lock.
      const prevIdx = ORDER.indexOf(lastTab as any);
      const currIdx = ORDER.indexOf(screen);
      if (!lastTab) {
        // The very first screen shown this session (cold app start) — show immediately at
        // rest, no animation, nothing to slide in from.
        translateX.value = 0;
        opacity.value = 1;
      } else if (prevIdx !== -1 && prevIdx !== currIdx) {
        const fromX = currIdx > prevIdx ? ENTER_OFFSET : -ENTER_OFFSET;
        // Safe to jump here even though it's a discontinuous change — opacity is still 0 (this
        // screen's own blur handler below already parked it there, or it's a brand-new mount
        // whose initial values already start parked/invisible) — nothing visible snaps.
        translateX.value = fromX;
        opacity.value = 0;
        translateX.value = withTiming(0, { duration: TAB_TRANSITION_MS, easing: Easing.out(Easing.cubic) });
        opacity.value = withTiming(1, { duration: TAB_TRANSITION_MS, easing: Easing.out(Easing.cubic) });
      } else {
        // Re-focusing the SAME tab after visiting a non-tab stack screen on top of it (e.g.
        // Settings, manifest-setup, a goal/sacrifice picker) — `lastTab` never changed while
        // away since only tab screens update it, so `prevIdx === currIdx` here. There's no
        // "direction" to slide in from; this screen was simply parked invisible by its OWN
        // blur handler below when the stack screen was pushed on top of it, and NOTHING would
        // otherwise ever bring it back to visible without this branch — that was the exact bug
        // (Home going completely blank after finishing goal/sacrifice selection and returning).
        // Just fade + settle back into place from wherever it was parked.
        translateX.value = withTiming(0, { duration: TAB_TRANSITION_MS, easing: Easing.out(Easing.cubic) });
        opacity.value = withTiming(1, { duration: TAB_TRANSITION_MS, easing: Easing.out(Easing.cubic) });
      }
      lastTab = screen;
      return () => {
        // BLUR — about to be hidden (instantly, with no transition of its own from the tabs
        // navigator). Park off-screen + invisible NOW, while still on top, so next time this
        // screen is focused it starts correctly with zero visible jump. The exact direction
        // parked here doesn't matter (opacity 0 hides it either way) — the next focus always
        // recomputes the correct direction fresh from `lastTab` at that future time.
        translateX.value = ENTER_OFFSET;
        opacity.value = 0;
      };
    }, [screen])
  );

  const idx = ORDER.indexOf(screen);
  const nextTab = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  const prevTab = idx > 0 ? ORDER[idx - 1] : null;

  const goTo = (t: "home" | "wall" | "ritual" | "me") => {
    if (isNavigatingRef.current) return; // a switch is already in flight — ignore duplicates.
    isNavigatingRef.current = true;
    // Use the LOCAL tabs navigator (same object/mechanism the tab bar's own onPress uses)
    // instead of the global router with an absolute path — guarantees this can only ever
    // switch tabs within the existing Tabs navigator and can never push a stray duplicate
    // entry onto the root stack, however rapidly/repeatedly it's called.
    (navigation as any).navigate(t);
    // Safety-net release in case focus doesn't fire promptly for some reason (e.g. navigating
    // toward a tab that's already focused) — never leave the gesture permanently locked out.
    setTimeout(() => { isNavigatingRef.current = false; }, 600);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      if (isNavigatingRef.current) return; // a switch is already committed — ignore further drag.
      // Live finger-follow with rubber-band resistance at the edges (no next/prev tab).
      let tx = e.translationX;
      if (tx < 0 && !nextTab) tx *= 0.3;
      if (tx > 0 && !prevTab) tx *= 0.3;
      translateX.value = tx;
    })
    .onEnd((e) => {
      if (isNavigatingRef.current) return; // ignore — a previous swipe's switch is still resolving.
      const { translationX, velocityX } = e;
      if ((translationX < -70 || velocityX < -700) && nextTab) {
        // Let the slide-out animation actually FINISH before switching tabs — navigating in
        // parallel with the animation could cut it short the instant the tab-bar toggles the
        // outgoing screen's visibility, which read as a stutter/jank on swipe.
        translateX.value = withTiming(-EXIT_DISTANCE, { duration: 180, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(goTo)(nextTab);
        });
      } else if ((translationX > 70 || velocityX > 700) && prevTab) {
        translateX.value = withTiming(EXIT_DISTANCE, { duration: 180, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(goTo)(prevTab);
        });
      } else {
        translateX.value = withSpring(0, SPRING);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
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
