import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, Pressable, Dimensions, InteractionManager } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated from "react-native-reanimated";
import { COLORS, DEITIES, GOAL_CATEGORIES, SACRIFICE_CATEGORIES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { Card } from "@/src/components/ui";
import { DeityStone } from "@/src/components/DeityStone";
import SwipeNav from "@/src/components/SwipeNav";
import { api } from "@/src/utils/api";
import { useAuth } from "@/src/context/AuthContext";
import { useDoubleBackExit } from "@/src/hooks/use-double-back-exit";

const { height: SCREEN_H } = Dimensions.get("window");

export default function Me() {
  const router = useRouter();
  const { user } = useAuth();
  const { toastStyle: exitToastStyle } = useDoubleBackExit();
  const [garden, setGarden] = useState<any[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const deity = DEITIES.find((d) => d.id === user?.deity_id) || DEITIES[0];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    try {
      const [g, s, n] = await Promise.all([
        api<any[]>("/garden").catch(() => []),
        user?.is_premium ? api<any[]>("/community/saved").catch(() => []) : Promise.resolve([]),
        api<any[]>("/notifications").catch(() => []),
      ]);
      setGarden(g);
      setSavedCount(s.length);
      setNotifications(n);
    } catch {}
  }, [user?.is_premium]);

  useFocusEffect(
    useCallback(() => {
      // Same deferral pattern as Home/Settings — waits for the tab-switch/slide animation to
      // settle before firing this focus fetch, instead of competing with it for the JS thread.
      const task = InteractionManager.runAfterInteractions(load);
      return () => task.cancel();
    }, [load])
  );

  const openNotification = async (n: any) => {
    if (!n.is_read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    }
    setShowNotifications(false);
    if (n.type === "ticket_reply" && n.ref_id) {
      router.push({ pathname: "/contact", params: { ticketId: n.ref_id } });
    }
  };

  return (
    <View style={styles.container} testID="me-screen">
      <AnimatedBackground deityColor={deity.color} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <SwipeNav screen="me">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              testID="me-notifications-bell"
              onPress={() => setShowNotifications(true)}
              hitSlop={12}
              style={styles.bellBtn}
            >
              <Ionicons name={unreadCount > 0 ? "notifications" : "notifications-outline"} size={20} color={unreadCount > 0 ? COLORS.gold : COLORS.gray1} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge} testID="me-notifications-badge">
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.header}>
            <View style={[styles.avatarWrap, { borderColor: deity.color }]}>
              {user?.picture ? (
                <Image source={{ uri: user.picture }} style={styles.avatar} />
              ) : (
                <Text style={styles.avatarInitial}>{user?.name?.[0]?.toUpperCase()}</Text>
              )}
            </View>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={[styles.deityName, { color: deity.color }]}>{deity.name}</Text>
            {/* Premium badge / upgrade CTA hidden for now — app is fully free until Google Play
                Billing is integrated. Restore this block once SUBSCRIPTIONS_ENABLED-equivalent
                is flipped back on. */}
          </View>

          <Text style={styles.section}>GARDEN OF MANIFESTATIONS</Text>
          {garden.length === 0 ? (
            <Text style={styles.empty}>No manifestations yet. Grow your first!</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {garden.map((g) => {
                const goal = GOAL_CATEGORIES.find((x) => x.key === g.manifestation?.goal_category);
                return (
                  <TouchableOpacity
                    key={g.id}
                    testID={`garden-item-${g.id}`}
                    activeOpacity={0.85}
                    onPress={() => setSelected(g)}
                    style={styles.fruit}
                  >
                    <Text style={{ fontSize: 24 }}>🍎</Text>
                    <Text style={styles.fruitLabel} numberOfLines={1}>{goal?.label ?? g.manifestation?.goal_category ?? "Goal"}</Text>
                    <Text style={styles.fruitDays}>{g.manifestation?.cycle_days}d</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={{ marginTop: 20 }}>
            <Card
              testID="me-saved"
              onPress={() => router.push("/saved")}
            >
              <View style={styles.menuRow}>
                <View style={styles.menuIcon}>
                  <Ionicons name="bookmark" size={18} color={COLORS.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuText}>Saved Manifestations</Text>
                  <Text style={styles.menuSub}>
                    {user?.is_premium ? `${savedCount} saved` : "Premium feature"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
              </View>
            </Card>

            <Text style={[styles.section, { marginTop: 20 }]}>HELP &amp; SUPPORT</Text>
            <Card testID="me-help" onPress={() => router.push("/help")}>
              <View style={styles.menuRow}>
                <View style={styles.menuIcon}>
                  <Ionicons name="help-circle-outline" size={18} color={COLORS.gray1} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuText}>Help</Text>
                  <Text style={styles.menuSub}>FAQ about goals, sacrifices &amp; rituals</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
              </View>
            </Card>
            <Card style={{ marginTop: 10 }} testID="me-contact-us" onPress={() => router.push("/contact")}>
              <View style={styles.menuRow}>
                <View style={styles.menuIcon}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.gray1} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuText}>Contact Us</Text>
                  <Text style={styles.menuSub}>Send a ticket, view replies</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
              </View>
            </Card>

            <Card style={{ marginTop: 20 }} testID="me-settings" onPress={() => router.push("/settings")}>
              <View style={styles.menuRow}>
                <View style={styles.menuIcon}>
                  <Ionicons name="settings-outline" size={18} color={COLORS.gray1} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuText}>Settings</Text>
                  <Text style={styles.menuSub}>Account, deity, privacy</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
              </View>
            </Card>
          </View>
        </ScrollView>
        </SwipeNav>
      </SafeAreaView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)} testID="garden-detail-modal">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)} />
          <View style={styles.detailSheet} testID="garden-detail-sheet">
            {selected && <GardenDetailPanel item={selected} onClose={() => setSelected(null)} />}
          </View>
        </View>
      </Modal>

      {/* Notifications — in-app only (ticket replies from support). No push/email. */}
      <Modal visible={showNotifications} transparent animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowNotifications(false)} />
          <View style={styles.notifSheet} testID="notifications-sheet">
            <View style={styles.detailHeader}>
              <View style={styles.detailHandle} />
              <TouchableOpacity testID="notifications-close" onPress={() => setShowNotifications(false)} style={styles.modalClose} hitSlop={16}>
                <Ionicons name="close" size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.notifTitle}>Notifications</Text>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}>
              {notifications.length === 0 ? (
                <Text style={styles.empty}>No notifications yet.</Text>
              ) : (
                notifications.map((n) => (
                  <TouchableOpacity
                    key={n.id}
                    testID={`notification-item-${n.id}`}
                    onPress={() => openNotification(n)}
                    activeOpacity={0.8}
                    style={[styles.notifRow, !n.is_read && styles.notifRowUnread]}
                  >
                    {!n.is_read && <View style={styles.notifDot} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifRowTitle}>{n.title}</Text>
                      <Text style={styles.notifRowBody} numberOfLines={2}>{n.body}</Text>
                      <Text style={styles.notifRowDate}>
                        {new Date(n.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Double-back-to-exit — Me is a top-level tab with nowhere to navigate back to. */}
      <Animated.View pointerEvents="none" testID="me-exit-toast" style={[styles.exitToast, exitToastStyle]}>
        <Text style={styles.exitToastText}>Press back again to exit</Text>
      </Animated.View>
    </View>
  );
}

function GardenDetailPanel({ item, onClose }: { item: any; onClose: () => void }) {
  const m = item.manifestation || {};
  const d = DEITIES.find((x) => x.id === m.deity_id) ?? DEITIES[0];
  const goal = GOAL_CATEGORIES.find((g) => g.key === m.goal_category);
  const sac = SACRIFICE_CATEGORIES.find((s) => s.key === m.sacrifice_category);
  const goalText = m.goal_category === "custom" ? (m.goal_custom || "Personal Goal") : `${goal?.emoji ?? "📌"} ${goal?.label ?? m.goal_category}`;
  const sacText = m.sacrifice_category === "custom" ? (m.sacrifice_custom || "Personal Sacrifice") : `${sac?.emoji ?? "📌"} ${sac?.label ?? m.sacrifice_category}`;
  const created = m.created_at ? new Date(m.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "-";
  const completed = m.manifested_at ? new Date(m.manifested_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
  const testimony = item.testimony || m.testimony;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[d.color + "22", COLORS.surface1]} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      <View style={styles.detailHeader}>
        <View style={styles.detailHandle} />
        <TouchableOpacity testID="garden-detail-close" onPress={onClose} style={styles.modalClose} hitSlop={16}>
          <Ionicons name="close" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center" }}>
          <DeityStone deityName={d.name} color={d.color} glow={d.glow} size={92} glowIntensity={1.4} />
          <Text style={[styles.detailDeity, { color: d.color }]}>{d.name.toUpperCase().split("").join(" ")}</Text>
        </View>

        <View style={styles.detailBlock}>
          <DetailRow label="GOAL" value={goalText} />
          <Divider />
          <DetailRow label="SACRIFICE" value={sacText} />
          <Divider />
          <DetailRow label="DURATION" value={`${m.cycle_days} days`} />
          <Divider />
          <DetailRow label="AFFIRMATION" value={m.affirmation_enabled ? "On" : "Off"} />
          <Divider />
          <DetailRow label="FASTING" value={m.fasting_enabled ? "Yes ✓" : "No"} />
          <Divider />
          <DetailRow label="HUSTLE LINKED" value={m.hustle_enabled ? "Yes ✓" : "No"} />
          <Divider />
          <DetailRow label="REMINDERS" value={m.reminder_count ? `${m.reminder_count}x/day` : "Off"} />
        </View>

        <View style={styles.detailBlock}>
          <DetailRow label="STATUS" value={m.status === "manifested" ? "✅ Manifested" : m.status === "active" ? "🌱 Active" : m.status} />
          <Divider />
          <DetailRow label="STREAK" value={`${m.streak_count ?? 0} days 🔥`} />
          <Divider />
          <DetailRow label="MAX STREAK" value={`${m.max_streak ?? 0} days`} />
          <Divider />
          <DetailRow label="COSMIC AT START" value={m.cosmic_level_at_start != null ? `${m.cosmic_level_at_start}%` : "-"} />
          {m.moon_phase_at_start ? (<><Divider /><DetailRow label="MOON AT START" value={`🌙 ${m.moon_phase_at_start}`} /></>) : null}
          <Divider />
          <DetailRow label="DONATED" value={m.donated ? `Yes · ₹${m.donation_amount || 0}` : "No"} />
        </View>

        {(m.goal_description || m.sacrifice_description) && (
          <View style={styles.detailBlock}>
            {m.goal_description ? (<DetailRow label="GOAL NOTES" value={m.goal_description} multiline />) : null}
            {m.goal_description && m.sacrifice_description ? <Divider /> : null}
            {m.sacrifice_description ? (<DetailRow label="SACRIFICE NOTES" value={m.sacrifice_description} multiline />) : null}
          </View>
        )}

        <View style={styles.detailBlock}>
          <DetailRow label="CREATED" value={created} />
          {completed && (<><Divider /><DetailRow label="COMPLETED" value={completed} /></>)}
        </View>

        {testimony ? (
          <View style={styles.testimonyBox}>
            <Text style={styles.rowLabel}>YOUR TESTIMONY</Text>
            <Text style={styles.testimonyText}>{testimony}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View style={[styles.row, multiline && { flexDirection: "column", alignItems: "flex-start", gap: 6 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, multiline && { maxWidth: "100%", textAlign: "left" }]} numberOfLines={multiline ? 6 : 2}>{value}</Text>
    </View>
  );
}
function Divider() { return <View style={styles.divider} />; }

const styles = StyleSheet.create({
  container: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: COLORS.surface1,
    alignItems: "center", justifyContent: "center",
  },
  bellBadge: {
    position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 999,
    backgroundColor: COLORS.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  bellBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: "800" },
  header: { alignItems: "center", marginTop: 4, marginBottom: 24 },
  avatarWrap: {
    width: 84, height: 84, borderRadius: 999,
    borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden",
    backgroundColor: COLORS.surface1,
  },
  avatar: { width: 78, height: 78, borderRadius: 999 },
  avatarInitial: { color: COLORS.white, fontSize: 32, fontWeight: "800" },
  name: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginTop: 12 },
  deityName: { fontSize: 14, fontStyle: "italic", letterSpacing: 2, marginTop: 4 },
  premiumPill: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: COLORS.gold + "20" },
  premiumText: { color: COLORS.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  upgradeText: { color: COLORS.gold, fontSize: 12, marginTop: 8, fontWeight: "600" },
  section: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 12 },
  empty: { color: COLORS.gray2, fontSize: 13, textAlign: "center", padding: 20 },
  fruit: {
    width: 72, height: 88, backgroundColor: COLORS.surface1,
    borderRadius: 16, alignItems: "center", justifyContent: "center",
  },
  fruitLabel: { color: COLORS.white, fontSize: 10, marginTop: 4, fontWeight: "600" },
  fruitDays: { color: COLORS.gray2, fontSize: 9, marginTop: 2 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center" },
  menuText: { color: COLORS.white, fontSize: 15, fontWeight: "600" },
  menuSub: { color: COLORS.gray2, fontSize: 12, marginTop: 2 },

  // Detail modal
  modalOverlay: { flex: 1 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000E0" },
  detailSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: SCREEN_H * 0.88,
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden",
  },
  detailHeader: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  detailHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: COLORS.gray3, marginBottom: 8 },
  modalClose: { position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: 999, backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center", zIndex: 5 },
  detailDeity: { fontSize: 16, fontWeight: "300", letterSpacing: 5, fontStyle: "italic", marginTop: 14 },
  detailBlock: { marginTop: 18, backgroundColor: COLORS.surface2, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  rowLabel: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  rowValue: { color: COLORS.white, fontSize: 14, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  divider: { height: 1, backgroundColor: COLORS.gray3 + "60" },
  testimonyBox: { marginTop: 18, marginBottom: 8, padding: 18, borderRadius: 18, backgroundColor: COLORS.gold + "10" },
  testimonyText: { color: COLORS.white, fontSize: 15, fontStyle: "italic", marginTop: 8, lineHeight: 24 },

  exitToast: { position: "absolute", bottom: 110, left: 24, right: 24, alignItems: "center" },
  exitToastText: {
    backgroundColor: "#000000CC", color: COLORS.white, fontSize: 13, fontWeight: "600",
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, overflow: "hidden",
  },

  notifSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: SCREEN_H * 0.75,
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden",
  },
  notifTitle: { color: COLORS.white, fontSize: 19, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  notifRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.gray3,
  },
  notifRowUnread: { backgroundColor: COLORS.gold + "0C" },
  notifDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger, marginTop: 5 },
  notifRowTitle: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  notifRowBody: { color: COLORS.gray1, fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  notifRowDate: { color: COLORS.gray2, fontSize: 10.5, marginTop: 5 },
});
