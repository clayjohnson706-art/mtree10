import React, { useEffect } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { COLORS } from "@/src/theme";
import { Card } from "@/src/components/ui";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 92;
const RING_STROKE = 9;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

// Daily-streak milestone tiers — gamified badges (§5): bronze at 7, silver at 21, gold at 40.
const MILESTONES = [
  { days: 7, label: "7", name: "Bronze", color: "#D08A4E" },
  { days: 21, label: "21", name: "Silver", color: "#C7CBDD" },
  { days: 40, label: "40", name: "Gold", color: COLORS.gold },
];

// Streak Hub — VIEW-ONLY progress (§6: no hold-to-mark here; that lives exclusively inside
// notification cards). Notification streak = animated progress ring; Daily streak = pulsing
// flame + milestone badges. Grouped as one hub, notification block first, daily below.
export default function NotificationStreakCard({
  score,
  target,
  notificationStreak,
  dailyStreak,
  maxDailyStreak,
  onDailyPress,
}: {
  score: number;
  target: number;
  notificationStreak: number;
  dailyStreak: number;
  maxDailyStreak: number;
  onDailyPress: () => void;
}) {
  const percent = target > 0 ? Math.min(100, Math.round((score / target) * 100)) : 0;
  const milestoneMsg =
    percent >= 100 ? "Sacred target complete ✦" :
    percent >= 75 ? "Final ascent — stay locked in" :
    percent >= 50 ? "Momentum unlocked" :
    percent >= 25 ? "Foundation is strong" :
    "Answer notifications to build your spark";

  // Animated ring fill
  const ringProgress = useSharedValue(0);
  useEffect(() => {
    ringProgress.value = withTiming(percent / 100, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [percent, ringProgress]);
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - ringProgress.value),
  }));

  // Living flame — gentle infinite pulse so the streak literally feels alive.
  const flamePulse = useSharedValue(1);
  useEffect(() => {
    flamePulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [flamePulse]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flamePulse.value }] }));
  const flameGlowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + (flamePulse.value - 1) * 3 }));

  const nextMilestone = MILESTONES.find((m) => dailyStreak < m.days);

  return (
    <Card testID="streak-hub-card" style={styles.card}>
      <LinearGradient
        colors={[COLORS.electric + "20", "rgba(0,0,0,0)", COLORS.gold + "10"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <Text style={styles.eyebrow}>⟡ STREAK HUB</Text>

      {/* ── Notification Streak — animated progress ring ───────────────────────── */}
      <View style={styles.ringRow}>
        <View style={styles.ringWrap} testID="notification-streak-progress">
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
              stroke={COLORS.surface3} strokeWidth={RING_STROKE} fill="none"
            />
            <AnimatedCircle
              cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
              stroke={COLORS.electric} strokeWidth={RING_STROKE} fill="none"
              strokeLinecap="round"
              strokeDasharray={`${RING_C}`}
              animatedProps={ringProps}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={styles.ringPercent}>{percent}%</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notification Streak</Text>
          <View style={styles.scorePill} testID="notification-streak-score">
            <Ionicons name="notifications" size={12} color={COLORS.electric} />
            <Text style={styles.score}>{score} / {target}</Text>
          </View>
          <Text style={styles.milestoneMsg}>{milestoneMsg}</Text>
          <Text style={styles.responseStreak}>🔁 {notificationStreak}-day response streak</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── Daily Ritual Streak — pulsing flame + milestone badges ─────────────── */}
      <Pressable onPress={onDailyPress} testID="daily-streak-summary" style={styles.dailyRow}>
        <View style={styles.flameWrap}>
          <Animated.View pointerEvents="none" style={[styles.flameGlow, flameGlowStyle]} />
          <Animated.Text style={[styles.flameEmoji, flameStyle]}>🔥</Animated.Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={styles.dailyNum}>{dailyStreak}</Text>
            <Text style={styles.dailyUnit}>DAY STREAK</Text>
          </View>
          <Text style={styles.dailySub}>
            {nextMilestone
              ? `${nextMilestone.days - dailyStreak} day${nextMilestone.days - dailyStreak === 1 ? "" : "s"} to ${nextMilestone.name} 🏅 · Best ${maxDailyStreak}`
              : `Gold tier legend · Best ${maxDailyStreak}`}
          </Text>
        </View>
        <View style={styles.detailsBtn} testID="daily-streak-details">
          <Text style={styles.details}>Details</Text>
          <Ionicons name="chevron-forward" size={13} color={COLORS.gold} />
        </View>
      </Pressable>

      {/* Milestone badge track */}
      <View style={styles.badgeTrack} testID="streak-milestone-badges">
        {MILESTONES.map((m, i) => {
          const achieved = dailyStreak >= m.days;
          return (
            <React.Fragment key={m.days}>
              {i > 0 && (
                <View style={[styles.badgeConnector, dailyStreak >= MILESTONES[i - 1].days && { backgroundColor: MILESTONES[i - 1].color }]} />
              )}
              <View
                style={[
                  styles.badge,
                  achieved
                    ? { backgroundColor: m.color + "26", borderColor: m.color }
                    : { borderColor: COLORS.gray3 },
                ]}
              >
                <Ionicons name={achieved ? "medal" : "medal-outline"} size={15} color={achieved ? m.color : COLORS.gray2} />
                <Text style={[styles.badgeText, achieved && { color: m.color }]}>{m.label}d</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, overflow: "hidden", borderColor: COLORS.electric + "38" },
  eyebrow: { color: COLORS.electric, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  ringRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
  ringPercent: { color: COLORS.white, fontSize: 19, fontWeight: "900" },
  title: { color: COLORS.white, fontSize: 18, fontWeight: "900" },
  scorePill: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: COLORS.electric + "20", borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 5, marginTop: 7,
    borderWidth: 1, borderColor: COLORS.electric + "35",
  },
  score: { color: COLORS.white, fontSize: 13.5, fontWeight: "900" },
  milestoneMsg: { color: COLORS.gray1, fontSize: 12, fontWeight: "700", marginTop: 7 },
  responseStreak: { color: COLORS.gray2, fontSize: 11, marginTop: 3 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 16 },
  dailyRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  flameWrap: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  flameGlow: {
    position: "absolute", width: 52, height: 52, borderRadius: 999,
    backgroundColor: COLORS.gold + "45",
    shadowColor: COLORS.gold, shadowOpacity: 1, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
  },
  flameEmoji: { fontSize: 30 },
  dailyNum: { color: COLORS.white, fontSize: 27, fontWeight: "900" },
  dailyUnit: { color: COLORS.gold, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.6 },
  dailySub: { color: COLORS.gray1, fontSize: 11.5, marginTop: 2 },
  detailsBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 12, paddingLeft: 6 },
  details: { color: COLORS.gold, fontSize: 12.5, fontWeight: "800" },
  badgeTrack: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: COLORS.surface2,
  },
  badgeText: { color: COLORS.gray2, fontSize: 11.5, fontWeight: "900" },
  badgeConnector: { flex: 1, height: 2, backgroundColor: COLORS.gray3, marginHorizontal: 6, borderRadius: 1 },
});
