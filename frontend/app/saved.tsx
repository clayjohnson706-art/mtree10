import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, Dimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, DEITIES, GOAL_CATEGORIES, SACRIFICE_CATEGORIES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { Card, FilledButton } from "@/src/components/ui";
import { DeityStone } from "@/src/components/DeityStone";
import { api } from "@/src/utils/api";
import { useAuth } from "@/src/context/AuthContext";

const { height: SCREEN_H } = Dimensions.get("window");

export default function Saved() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.is_premium) return;
    setLoading(true);
    try {
      const data = await api<any[]>("/community/saved");
      setItems(data);
    } catch {}
    finally { setLoading(false); }
  }, [user?.is_premium]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const removeSaved = async (id: string) => {
    setItems((prev) => prev.filter((m) => m.id !== id));
    try { await api(`/community/save/${id}`, { method: "POST" }); } catch {}
  };

  if (!user?.is_premium) {
    return (
      <View style={styles.container} testID="saved-locked">
        <AnimatedBackground deityColor={COLORS.gold} />
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} testID="saved-back" hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.title}>Saved</Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={styles.center}>
            <Ionicons name="lock-closed" size={44} color={COLORS.gold} />
            <Text style={styles.lockTitle}>Saved Manifestations is Premium</Text>
            <Text style={styles.lockDesc}>Bookmark inspiring manifestations from the Wall.</Text>
            <FilledButton
              testID="saved-upgrade"
              label="Upgrade ✦"
              onPress={() => router.push("/paywall")}
              style={{ marginTop: 24, width: 200 }}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="saved-screen">
      <AnimatedBackground deityColor={COLORS.gold} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="saved-back" hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.title}>Saved Manifestations</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {loading && <Text style={styles.hint}>Loading...</Text>}
          {!loading && items.length === 0 && (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Ionicons name="bookmark-outline" size={44} color={COLORS.gray2} />
              <Text style={[styles.hint, { marginTop: 12 }]}>No saved manifestations yet.</Text>
              <Text style={styles.hintSmall}>Tap the bookmark icon on any Wall card.</Text>
            </View>
          )}
          {items.map((m) => {
            const d = DEITIES.find((x) => x.id === m.deity_id) ?? DEITIES[0];
            const goal = GOAL_CATEGORIES.find((g) => g.key === m.goal_category);
            const isDone = m.status === "manifested";
            return (
              <TouchableOpacity
                key={m.id}
                testID={`saved-item-${m.id}`}
                onPress={() => setSelected(m)}
                activeOpacity={0.9}
                style={{ marginBottom: 12 }}
              >
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{m.user_name || "Anonymous"}</Text>
                      <View style={styles.deityRow}>
                        <View style={[styles.deityChip, { backgroundColor: d.color + "20" }]}>
                          <Text style={{ color: d.color, fontSize: 11, fontWeight: "700" }}>{d.name}</Text>
                        </View>
                        <TouchableOpacity
                          testID={`saved-remove-${m.id}`}
                          onPress={(e) => { e.stopPropagation?.(); removeSaved(m.id); }}
                          hitSlop={12}
                          style={styles.bookmarkBtn}
                        >
                          <Ionicons name="bookmark" size={18} color={COLORS.gold} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.goalRow}>
                    {m.goal_category === "custom" ? "✨ Personal Goal" : `${goal?.emoji ?? "📌"} ${goal?.label ?? m.goal_category}`} · {m.cycle_days} days
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                    <View style={[styles.dot, { backgroundColor: isDone ? COLORS.success : COLORS.warning }]} />
                    <Text style={styles.metaText}>{isDone ? "Manifested" : `Day ${m.current_day}/${m.cycle_days}`}</Text>
                    <Text style={[styles.metaText, { marginLeft: 12 }]}>🔥 {m.streak_count}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)} />
          <View style={styles.detailSheet}>
            {selected && <DetailPanel manifestation={selected} onClose={() => setSelected(null)} onRemove={() => { removeSaved(selected.id); setSelected(null); }} />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailPanel({ manifestation, onClose, onRemove }: any) {
  const m = manifestation;
  const d = DEITIES.find((x) => x.id === m.deity_id) ?? DEITIES[0];
  const goal = GOAL_CATEGORIES.find((g) => g.key === m.goal_category);
  const sac = SACRIFICE_CATEGORIES.find((s) => s.key === m.sacrifice_category);
  const goalText = m.goal_category === "custom" ? "✨ Personal Goal" : `${goal?.emoji ?? "📌"} ${goal?.label ?? m.goal_category}`;
  const sacText = m.sacrifice_category === "custom" ? "🔒 Personal Sacrifice" : `${sac?.emoji ?? "📌"} ${sac?.label ?? m.sacrifice_category}`;
  const created = m.created_at ? new Date(m.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "-";
  const completed = m.manifested_at ? new Date(m.manifested_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[d.color + "22", COLORS.surface1]} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      <View style={styles.detailHeader}>
        <View style={styles.detailHandle} />
        <TouchableOpacity testID="saved-detail-close" onPress={onClose} style={styles.modalClose} hitSlop={16}>
          <Ionicons name="close" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center" }}>
          <DeityStone deityName={d.name} color={d.color} glow={d.glow} size={92} glowIntensity={1.4} />
          <Text style={[styles.detailDeity, { color: d.color }]}>{d.name.toUpperCase().split("").join(" ")}</Text>
          <Text style={styles.detailUser}>{m.user_name || "Anonymous"}</Text>
        </View>
        <View style={styles.detailBlock}>
          <DetailRow label="GOAL" value={goalText} />
          <Divider /><DetailRow label="SACRIFICE" value={sacText} />
          <Divider /><DetailRow label="DURATION" value={`${m.cycle_days} days`} />
          <Divider /><DetailRow label="AFFIRMATION" value={m.affirmation_enabled ? "On" : "Off"} />
          <Divider /><DetailRow label="FASTING" value={m.fasting_enabled ? "Yes ✓" : "No"} />
        </View>
        <View style={styles.detailBlock}>
          <DetailRow label="STATUS" value={m.status === "manifested" ? "✅ Manifested" : m.status === "active" ? "🌱 Active" : m.status} />
          <Divider /><DetailRow label="STREAK" value={`${m.streak_count} days 🔥`} />
          <Divider /><DetailRow label="MAX STREAK" value={`${m.max_streak} days`} />
          <Divider /><DetailRow label="DONATED" value={m.donated ? `Yes · ₹${m.donation_amount || 0}` : "No"} />
        </View>
        <View style={styles.detailBlock}>
          <DetailRow label="CREATED" value={created} />
          {m.moon_phase_at_start ? (<><Divider /><DetailRow label="MOON AT START" value={`🌙 ${m.moon_phase_at_start}`} /></>) : null}
          {completed && (<><Divider /><DetailRow label="COMPLETED" value={completed} /></>)}
        </View>
        {m.testimony ? (
          <View style={styles.testimonyBox}>
            <Text style={styles.rowLabel}>TESTIMONY</Text>
            <Text style={styles.testimonyText}>{m.testimony}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          testID="saved-remove-detail"
          onPress={onRemove}
          style={styles.removeBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="bookmark" size={18} color={COLORS.gold} />
          <Text style={styles.removeText}>Remove from Saved</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}
function Divider() { return <View style={styles.divider} />; }

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  lockTitle: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginTop: 16, textAlign: "center" },
  lockDesc: { color: COLORS.gray1, fontSize: 14, textAlign: "center", marginTop: 8 },
  hint: { color: COLORS.gray1, textAlign: "center", fontSize: 14 },
  hintSmall: { color: COLORS.gray2, textAlign: "center", fontSize: 12, marginTop: 4 },
  userName: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  deityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  deityChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  bookmarkBtn: { width: 32, height: 32, borderRadius: 999, backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center" },
  goalRow: { color: COLORS.gray1, fontSize: 13, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  metaText: { color: COLORS.gray2, fontSize: 12, marginLeft: 6 },

  modalOverlay: { flex: 1 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000E0" },
  detailSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: SCREEN_H * 0.88,
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden",
  },
  detailHeader: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  detailHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: COLORS.gray3, marginBottom: 8 },
  modalClose: { position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: 999, backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center", zIndex: 5 },
  detailDeity: { fontSize: 16, fontWeight: "300", letterSpacing: 5, fontStyle: "italic", marginTop: 14 },
  detailUser: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginTop: 8 },
  detailBlock: { marginTop: 18, backgroundColor: COLORS.surface2, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  rowLabel: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  rowValue: { color: COLORS.white, fontSize: 14, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  divider: { height: 1, backgroundColor: COLORS.gray3 + "60" },
  testimonyBox: { marginTop: 18, padding: 18, borderRadius: 18, backgroundColor: COLORS.gold + "10" },
  testimonyText: { color: COLORS.white, fontSize: 15, fontStyle: "italic", marginTop: 8, lineHeight: 24 },
  removeBtn: { marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 16, backgroundColor: COLORS.gold + "18" },
  removeText: { color: COLORS.gold, fontSize: 14, fontWeight: "700" },
});
