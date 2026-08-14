import React, { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
  interpolate,
} from "react-native-reanimated";
import { COLORS } from "@/src/theme";

const HOLD_MS = 1500;

// Reanimated (UI-thread) hold-to-confirm button — 60fps fill, light haptic on press,
// heavy haptic on completion. Same public API/testIDs as the previous implementation.
export default function HoldProgressButton({
  testID,
  label,
  onComplete,
  disabled,
  color = COLORS.gold,
  style,
}: {
  testID: string;
  label: string;
  onComplete: () => void | Promise<void>;
  disabled?: boolean;
  color?: string;
  style?: ViewStyle;
}) {
  const progress = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const completed = useRef(false);
  const [holding, setHolding] = useState(false);

  const haptic = (kind: "start" | "success") => {
    if (Platform.OS === "web") return;
    if (kind === "start") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const finish = () => {
    completed.current = true;
    setHolding(false);
    haptic("success");
    onComplete();
  };

  const start = () => {
    if (disabled) return;
    completed.current = false;
    setHolding(true);
    haptic("start");
    pressScale.value = withSpring(0.97, { damping: 16, stiffness: 260 });
    progress.value = 0;
    progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(finish)();
    });
  };

  const stop = () => {
    pressScale.value = withSpring(1, { damping: 16, stiffness: 260 });
    if (completed.current) return;
    setHolding(false);
    progress.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
  };

  const fillStyle = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [0, 1], [0, 100])}%`,
    backgroundColor: color,
  }));
  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));

  return (
    <Animated.View style={[wrapStyle, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityHint="Press and hold for one and a half seconds"
        disabled={disabled}
        onPressIn={start}
        onPressOut={stop}
        style={[styles.button, { borderColor: color }, disabled && styles.disabled]}
      >
        <Animated.View pointerEvents="none" style={[styles.fill, fillStyle]} />
        <Ionicons name={holding ? "finger-print" : "sparkles"} size={20} color={holding ? COLORS.void : color} />
        <Text style={[styles.label, { color: holding ? COLORS.void : color }]}>
          {holding ? "KEEP HOLDING" : label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: COLORS.surface2,
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  label: { fontSize: 14, fontWeight: "900", letterSpacing: 0.8 },
  disabled: { opacity: 0.45 },
});
