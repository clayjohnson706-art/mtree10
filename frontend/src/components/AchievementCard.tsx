import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/src/theme";
import { DeityStone } from "@/src/components/DeityStone";
import AppLogo from "@/src/components/AppLogo";

// Branded, shareable "achievement" card — captured as an image (via react-native-view-shot
// in success.tsx) instead of the old plain-text share message. Kept as a plain presentational
// component (no ScrollView/touchables inside) so it captures cleanly on both native and web.
export type AchievementCardProps = {
  goalLabel: string;
  goalEmoji?: string;
  deityName: string;
  deityColor: string;
  deityGlow?: string;
  cycleDays: number;
  streakCount: number;
  achievedDateLabel: string;
  testimony?: string | null;
};

export default function AchievementCard({
  goalLabel,
  goalEmoji,
  deityName,
  deityColor,
  deityGlow,
  cycleDays,
  streakCount,
  achievedDateLabel,
  testimony,
}: AchievementCardProps) {
  return (
    <View style={styles.outer} collapsable={false}>
      <LinearGradient
        colors={[deityColor + "3D", COLORS.void, COLORS.void]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <View pointerEvents="none" style={[styles.glowOrb, { backgroundColor: deityColor + "22" }]} />

      <View style={styles.brandRow}>
        <AppLogo size={28} />
        <Text style={styles.brandText}>mTree</Text>
      </View>

      <View style={styles.stoneWrap}>
        <DeityStone deityName={deityName} color={deityColor} glow={deityGlow} size={96} glowIntensity={1.4} />
      </View>

      <View style={[styles.badge, { borderColor: deityColor + "60", backgroundColor: deityColor + "1A" }]}>
        <Text style={[styles.badgeText, { color: deityColor }]}>✦ MANIFESTED</Text>
      </View>

      <Text style={styles.goalText} numberOfLines={3}>
        {goalEmoji ? `${goalEmoji}  ` : ""}{goalLabel}
      </Text>
      <Text style={styles.metaText}>
        {cycleDays} days of ritual · guided by {deityName}
      </Text>

      {!!testimony && (
        <Text style={styles.testimonyText} numberOfLines={3}>
          “{testimony}”
        </Text>
      )}

      <View style={styles.footerRow}>
        <View style={styles.footerStat}>
          <Text style={styles.footerStatNum}>🔥 {streakCount}</Text>
          <Text style={styles.footerStatLabel}>STREAK</Text>
        </View>
        <View style={styles.footerDivider} />
        <View style={styles.footerStat}>
          <Text style={styles.footerStatNum}>{achievedDateLabel}</Text>
          <Text style={styles.footerStatLabel}>ACHIEVED</Text>
        </View>
      </View>

      <Text style={styles.tagline}>Manifest your reality with mTree</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    overflow: "hidden",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.gray3,
  },
  glowOrb: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 999,
    top: -80,
    alignSelf: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  brandText: { color: COLORS.white, fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  stoneWrap: { marginTop: 18 },
  badge: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  goalText: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "800",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 18,
    lineHeight: 28,
  },
  metaText: {
    color: COLORS.gray1,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  testimonyText: {
    color: COLORS.gray1,
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    gap: 20,
  },
  footerStat: { alignItems: "center" },
  footerStatNum: { color: COLORS.gold, fontSize: 16, fontWeight: "800" },
  footerStatLabel: { color: COLORS.gray2, fontSize: 9, fontWeight: "700", letterSpacing: 1.5, marginTop: 4 },
  footerDivider: { width: 1, height: 26, backgroundColor: COLORS.gray3 },
  tagline: {
    color: COLORS.gray2,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 22,
    textTransform: "uppercase",
  },
});
