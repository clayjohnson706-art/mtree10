import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/theme";
import { InfoModal } from "@/src/components/InfoModal";
import { api } from "@/src/utils/api";

// Streak-length badges a user can earn — used to compute "next milestone" progress.
const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

const getLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

type CellStatus = "completed" | "missed" | "today" | "upcoming";
type Cell = { dayNum: number; dateStr: string; status: CellStatus };

// Rich, graphical "Streak Detail" sheet — replaces the old plain-text InfoModal sections with
// stat cards, a milestone progress bar, an accurate day-by-day completed/missed calendar
// (built from real /ritual-history data, fetched on-demand only while this sheet is open —
// keeps Home's own load fast), and short icon+caption tips instead of paragraphs.
export default function StreakDetailModal({
  visible,
  onClose,
  manifestation,
  deityColor,
}: {
  visible: boolean;
  onClose: () => void;
  manifestation: any;
  deityColor: string;
}) {
  const [ritualDates, setRitualDates] = useState<string[] | null>(null);

  useEffect(() => {
    if (!visible || !manifestation?.id) return;
    let cancelled = false;
    setRitualDates(null);
    api<{ rituals: { day_number: number; local_date: string | null }[] }>(`/manifestations/${manifestation.id}/ritual-history`)
      .then((res) => {
        if (cancelled) return;
        setRitualDates((res.rituals || []).map((r) => r.local_date).filter(Boolean) as string[]);
      })
      .catch(() => { if (!cancelled) setRitualDates([]); });
    return () => { cancelled = true; };
  }, [visible, manifestation?.id]);

  const todayStr = getLocalDateStr(new Date());
  const doneToday = manifestation?.last_ritual_local_date === todayStr;
  const streak = manifestation?.streak_count ?? 0;

  const { nextMilestone, milestonePct } = useMemo(() => {
    const next = MILESTONES.find((m) => m > streak) ?? null;
    const passed = MILESTONES.filter((m) => m <= streak);
    const prev = passed.length ? passed[passed.length - 1] : 0;
    const span = next ? next - prev : 1;
    const pct = next ? Math.min(1, Math.max(0, (streak - prev) / span)) : 1;
    return { nextMilestone: next, milestonePct: pct };
  }, [streak]);

  const calendarCells: Cell[] = useMemo(() => {
    if (!manifestation || ritualDates === null) return [];
    const cycleDays = manifestation.cycle_days ?? 21;
    const sorted = [...ritualDates].sort();
    const startStr = sorted[0] || todayStr;
    const start = new Date(startStr + "T00:00:00");
    const completedSet = new Set(ritualDates);
    const cells: Cell[] = [];
    for (let i = 0; i < cycleDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dStr = getLocalDateStr(d);
      let status: CellStatus;
      if (completedSet.has(dStr)) status = "completed";
      else if (dStr === todayStr) status = "today";
      else if (dStr < todayStr) status = "missed";
      else status = "upcoming";
      cells.push({ dayNum: i + 1, dateStr: dStr, status });
    }
    return cells;
  }, [manifestation, ritualDates, todayStr]);

  if (!manifestation) return null;

  return (
    <InfoModal
      testID="streak-detail-modal"
      visible={visible}
      onClose={onClose}
      title={`${streak}-Day Streak`}
      subtitle={doneToday ? "✓ Today's ritual is complete" : "⏳ Today's ritual is still pending"}
      accent={COLORS.gold}
      icon={<Text style={{ fontSize: 40 }}>🔥</Text>}
      sections={[
        {
          label: "YOUR STATS",
          body: (
            <View style={styles.statGrid}>
              <StatBox icon="flame" color={COLORS.gold} value={String(streak)} label="CURRENT STREAK" />
              <StatBox icon="trophy" color={COLORS.gold} value={String(manifestation.max_streak ?? 0)} label="LONGEST STREAK" />
              <StatBox icon="checkmark-done" color={COLORS.success} value={String(manifestation.current_day ?? 0)} label="TOTAL DAYS" />
            </View>
          ),
        },
        {
          label: "NEXT MILESTONE",
          body: nextMilestone ? (
            <View>
              <View style={styles.milestoneRow}>
                <Text style={styles.milestoneText}>
                  {nextMilestone - streak} day{nextMilestone - streak === 1 ? "" : "s"} to go
                </Text>
                <View style={styles.milestoneBadge}>
                  <Ionicons name="ribbon" size={12} color={COLORS.gold} />
                  <Text style={styles.milestoneBadgeText}>{nextMilestone}-day badge</Text>
                </View>
              </View>
              <View style={styles.milestoneBarTrack}>
                <View style={[styles.milestoneBarFill, { width: `${milestonePct * 100}%`, backgroundColor: deityColor }]} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="trophy" size={18} color={COLORS.gold} />
              <Text style={styles.legendaryText}>Legendary — you&apos;ve passed every milestone!</Text>
            </View>
          ),
        },
        {
          label: "STREAK CALENDAR",
          body: ritualDates === null ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginVertical: 24 }} testID="streak-calendar-loading" />
          ) : (
            <View testID="streak-calendar">
              <View style={styles.calendarGrid}>
                {calendarCells.map((c) => (
                  <View key={c.dayNum} style={[styles.calCell, calCellStyle(c.status, deityColor)]}>
                    {c.status === "completed" ? (
                      <Ionicons name="checkmark" size={13} color={COLORS.void} />
                    ) : c.status === "missed" ? (
                      <Ionicons name="close" size={11} color={COLORS.gray2} />
                    ) : c.status === "today" ? (
                      <View style={styles.calCellTodayDot} />
                    ) : (
                      <Text style={styles.calCellNum}>{c.dayNum}</Text>
                    )}
                  </View>
                ))}
              </View>
              <View style={styles.legendRow}>
                <LegendDot color={deityColor} label="Completed" />
                <LegendDot color={COLORS.surface2} borderColor={COLORS.gray3} label="Missed" />
                <LegendDot color="transparent" borderColor={COLORS.gold} label="Today" />
              </View>
            </View>
          ),
        },
        {
          label: "HOW STREAKS WORK",
          body: (
            <View style={{ gap: 12 }}>
              <IconTip icon="checkmark-circle" color={COLORS.success} text="Complete your daily ritual once every calendar day" />
              <IconTip icon="flame" color={COLORS.gold} text="Consecutive days in a row build your streak higher" />
              <IconTip icon="close-circle" color={COLORS.danger} text="Missing a full day resets your current streak to 1" />
              <IconTip icon="trophy" color={COLORS.gold} text="Your longest streak is saved forever as your personal best" />
            </View>
          ),
        },
      ]}
    />
  );
}

function calCellStyle(status: CellStatus, deityColor: string) {
  if (status === "completed") return { backgroundColor: deityColor, borderColor: deityColor };
  if (status === "today") return { backgroundColor: COLORS.gold + "18", borderColor: COLORS.gold, borderWidth: 2 };
  if (status === "missed") return { backgroundColor: COLORS.surface2, borderColor: COLORS.gray3 };
  return { backgroundColor: "transparent", borderColor: COLORS.gray3 + "80" };
}

function StatBox({ icon, color, value, label }: { icon: any; color: string; value: string; label: string }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LegendDot({ color, borderColor, label }: { color: string; borderColor?: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color, borderColor: borderColor || color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function IconTip({ icon, color, text }: { icon: any; color: string; text: string }) {
  return (
    <View style={styles.tipRow}>
      <View style={[styles.tipIconWrap, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: "row", gap: 10 },
  statBox: { flex: 1, alignItems: "center", backgroundColor: COLORS.surface1, borderRadius: 14, paddingVertical: 14, gap: 4 },
  statValue: { color: COLORS.white, fontSize: 20, fontWeight: "900", marginTop: 2 },
  statLabel: { color: COLORS.gray2, fontSize: 8.5, fontWeight: "700", letterSpacing: 1, textAlign: "center" },

  milestoneRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  milestoneText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  milestoneBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.gold + "18", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  milestoneBadgeText: { color: COLORS.gold, fontSize: 10.5, fontWeight: "800" },
  milestoneBarTrack: { height: 8, borderRadius: 999, backgroundColor: COLORS.surface1, overflow: "hidden" },
  milestoneBarFill: { height: "100%", borderRadius: 999 },
  legendaryText: { color: COLORS.white, fontSize: 14, fontWeight: "700" },

  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  calCell: {
    width: "12%", aspectRatio: 1, borderRadius: 999, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", marginBottom: 2,
  },
  calCellNum: { color: COLORS.gray2, fontSize: 9, fontWeight: "700" },
  calCellTodayDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: COLORS.gold },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 999, borderWidth: 1.5 },
  legendLabel: { color: COLORS.gray1, fontSize: 11, fontWeight: "600" },

  tipRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tipIconWrap: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  tipText: { color: COLORS.white, fontSize: 13, fontWeight: "500", flex: 1, lineHeight: 18 },
});
