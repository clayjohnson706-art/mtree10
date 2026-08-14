import React from "react";
import { Text, TouchableOpacity, View, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { COLORS } from "@/src/theme";

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
  return (
    <TouchableOpacity
      // NOTE: use onPressIn instead of onPress — on Android + New Architecture,
      // react-native-reanimated's continuously-animating background views (AnimatedBackground)
      // can cause TouchableOpacity's onPress (fires on release) to silently stop responding
      // (known RN/Reanimated New Arch regression). onPressIn (fires on touch-down) is unaffected
      // and is the standard workaround, so primary CTA buttons stay tappable everywhere.
      onPressIn={onPress}
      disabled={disabled}
      testID={testID}
      activeOpacity={0.85}
      style={[
        styles.filled,
        disabled && styles.filledDisabled,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.filledText, disabled && styles.filledTextDisabled]}>{label}</Text>
    </TouchableOpacity>
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
  return (
    <TouchableOpacity onPressIn={onPress} testID={testID} activeOpacity={0.85} style={[styles.ghost, style]}>
      <Text style={styles.ghostText}>{label}</Text>
    </TouchableOpacity>
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
    <TouchableOpacity
      onPress={onPress}
      testID={testID}
      activeOpacity={0.85}
      style={[
        styles.chip,
        selected && { backgroundColor: color + "20", borderColor: color },
      ]}
    >
      {emoji && <Text style={{ fontSize: 14, marginRight: 6 }}>{emoji}</Text>}
      <Text style={[styles.chipText, selected && { color: color, fontWeight: "600" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

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
  const inner = <View style={[styles.card, style]} testID={onPress ? undefined : testID}>{children}</View>;
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} testID={testID} activeOpacity={0.85} style={wrapperStyle}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  filled: {
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 24,
    shadowColor: COLORS.gold,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  filledDisabled: {
    backgroundColor: COLORS.surface2,
    shadowOpacity: 0,
    elevation: 0,
  },
  filledText: {
    color: COLORS.void,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  filledTextDisabled: {
    color: COLORS.gray2,
  },
  ghost: {
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.gold + "18",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  ghostText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: "600",
  },
  chip: {
    height: 42,
    borderRadius: 999,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface1,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipText: {
    color: COLORS.gray1,
    fontSize: 14,
    fontWeight: "500",
  },
  card: {
    backgroundColor: COLORS.surface1,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
  },
});
