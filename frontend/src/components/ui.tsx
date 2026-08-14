import React from "react";
import { Text, View, StyleSheet, ViewStyle, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { COLORS } from "@/src/theme";

// Shared micro-interaction: every pressable surface gently scales down while pressed —
// the app-wide "everything responds to touch" feel, running on the UI thread (Reanimated).
function usePressScale(amount = 0.97) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onIn = () => { scale.value = withSpring(amount, { damping: 18, stiffness: 320 }); };
  const onOut = () => { scale.value = withSpring(1, { damping: 16, stiffness: 300 }); };
  return { style, onIn, onOut };
}

export function FilledButton({
  label,
  onPress,
  disabled,
  testID,
  style,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
  icon?: React.ReactNode;
}) {
  const press = usePressScale(0.96);
  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        // NOTE: onPressIn instead of onPress — on Android + New Architecture, continuously
        // animating Reanimated backgrounds can make release-based onPress silently drop
        // (known RN/Reanimated regression); touch-down events are unaffected.
        onPressIn={() => { press.onIn(); if (!disabled) onPress(); }}
        onPressOut={press.onOut}
        disabled={disabled}
        testID={testID}
        style={[styles.filled, disabled && styles.filledDisabled]}
      >
        {!disabled && (
          <LinearGradient
            colors={[COLORS.gold, "#FFDE7A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        {icon}
        <Text style={[styles.filledText, disabled && styles.filledTextDisabled]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function GhostButton({
  label,
  onPress,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  style?: ViewStyle;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        onPressIn={() => { press.onIn(); onPress(); }}
        onPressOut={press.onOut}
        testID={testID}
        style={styles.ghost}
      >
        <Text style={styles.ghostText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color = COLORS.gold,
  testID,
  emoji,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  color?: string;
  testID?: string;
  emoji?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: color + "22", borderColor: color },
        pressed && { opacity: 0.8 },
      ]}
    >
      {emoji && <Text style={{ fontSize: 14, marginRight: 6 }}>{emoji}</Text>}
      <Text style={[styles.chipText, selected && { color: color, fontWeight: "700" }]}>{label}</Text>
    </Pressable>
  );
}

// Premium glass card — layered translucent surface with a hairline light border, a soft
// top-sheen gradient and deep ambient shadow. The whole app's core building block.
export function Card({
  children,
  style,
  onPress,
  testID,
  wrapperStyle,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  testID?: string;
  wrapperStyle?: ViewStyle;
}) {
  const press = usePressScale(0.98);
  const inner = (
    <View style={[styles.card, style]} testID={onPress ? undefined : testID}>
      <LinearGradient
        colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0.00)"]}
        style={styles.cardSheen}
        pointerEvents="none"
      />
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Animated.View style={[press.style, wrapperStyle]}>
        <Pressable onPress={onPress} onPressIn={press.onIn} onPressOut={press.onOut} testID={testID}>
          {inner}
        </Pressable>
      </Animated.View>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  filled: {
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 24,
    overflow: "hidden",
    shadowColor: COLORS.gold,
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  filledDisabled: {
    backgroundColor: COLORS.surface2,
    shadowOpacity: 0,
    elevation: 0,
  },
  filledText: {
    color: COLORS.void,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  filledTextDisabled: {
    color: COLORS.gray2,
  },
  ghost: {
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.gold + "16",
    borderWidth: 1,
    borderColor: COLORS.gold + "35",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  ghostText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: "700",
  },
  chip: {
    height: 42,
    borderRadius: 999,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  chipText: {
    color: COLORS.gray1,
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: COLORS.surface1 + "F2",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
  },
  cardSheen: { position: "absolute", left: 0, right: 0, top: 0, height: 60 },
});
