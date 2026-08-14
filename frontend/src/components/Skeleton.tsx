import React, { useEffect } from "react";
import { StyleSheet, ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { COLORS } from "@/src/theme";

// A single pulsing placeholder block — the reusable primitive for skeleton loading states
// across the app (replaces bare ActivityIndicator spinners with a proper "shimmer" shape that
// mimics the real content's layout, so the loading state doesn't visually jump when real
// content arrives). Centered by default via its own alignSelf so it never drifts to one side
// inside a flex container — every skeleton screen composes these inside a centered/row layout.
export default function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.9, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.base, style, animStyle]} />;
}

const styles = StyleSheet.create({
  base: { backgroundColor: COLORS.surface2, borderRadius: 8 },
});
