import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/src/theme";

const { width, height } = Dimensions.get("window");

// Static, still, dark-purple background — deliberately has ZERO animation/motion (no
// Reanimated, no shared values, no useEffect loops). The previous version mounted 25
// individually-animated elements (3 drifting blobs + 22 pulsing stars) on EVERY single
// screen, all running continuously — the single biggest contributor to the app feeling
// heavy/low-fps, and it visibly shifted during tab-swipe transitions. This renders once and
// never changes: a static gradient plus two fixed, non-moving tinted circles (one neutral,
// one in the current deity's color for a subtle "sacred" per-deity accent) — same visual
// language as before, just completely motionless and far lighter on every screen.
function AnimatedBackground({ deityColor = COLORS.electric }: { deityColor?: string }) {
  return (
    <View style={styles.container} pointerEvents="none">
      <LinearGradient
        colors={[COLORS.void, COLORS.bg, COLORS.void]}
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[styles.tint, { width: 420, height: 420, left: -100, top: -50, backgroundColor: "#4E9AF1", opacity: 0.05 }]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.tint,
          { width: 340, height: 340, left: width / 2 - 170, top: height / 3, backgroundColor: deityColor, opacity: 0.045 },
        ]}
      />
    </View>
  );
}

// Memoized: `deityColor` is the only prop, so this only ever needs to re-render when the
// deity (and thus its accent tint) changes — never on unrelated parent state changes.
export default React.memo(AnimatedBackground);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.void,
  },
  tint: {
    position: "absolute",
    borderRadius: 999,
  },
});
