import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, PRICING, formatPrice } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { Card, FilledButton, GhostButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

const BENEFITS = [
  { icon: "sparkles", text: "Daily Affirmations (Hindi & English)" },
  { icon: "notifications", text: "Custom Reminders + Busy Hours" },
  { icon: "grid", text: "Full Manifestation Wall access" },
  { icon: "bookmark", text: "Save inspiring manifestations" },
  { icon: "cloud-upload", text: "All future premium features" },
];

export default function Subscription() {
  const router = useRouter();
  const { user, subscribe, refresh } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string>("monthly");
  const [busy, setBusy] = useState(false);
  const isPremium = !!user?.is_premium;
  const expiry = user?.premium_expires_at ? new Date(user.premium_expires_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;

  const doSubscribe = async () => {
    setBusy(true);
    try {
      await subscribe(selectedPlan);
      await refresh();
      router.back();
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.container} testID="subscription-screen">
      <AnimatedBackground deityColor={COLORS.gold} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="subscription-back" hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.title}>Subscription</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {/* Status */}
          <Card style={{ overflow: "hidden" }} testID="subscription-status">
            <LinearGradient colors={[COLORS.gold + "22", COLORS.surface1]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.statusRow}>
              <View>
                <Text style={styles.statusLabel}>CURRENT PLAN</Text>
                <Text style={styles.statusValue}>{isPremium ? "Premium ✦" : "Free"}</Text>
                {isPremium && expiry ? <Text style={styles.statusExpiry}>Renews / expires {expiry}</Text> : null}
              </View>
              <View style={[styles.pill, { backgroundColor: (isPremium ? COLORS.success : COLORS.gray3) + "22" }]}>
                <Text style={{ color: isPremium ? COLORS.success : COLORS.gray1, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>
                  {isPremium ? "ACTIVE" : "INACTIVE"}
                </Text>
              </View>
            </View>
          </Card>

          <Text style={styles.section}>WHAT YOU GET</Text>
          <Card>
            {BENEFITS.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <Ionicons name={b.icon as any} size={16} color={COLORS.gold} />
                </View>
                <Text style={styles.benefitText}>{b.text}</Text>
              </View>
            ))}
          </Card>

          <Text style={styles.section}>CHOOSE YOUR PLAN</Text>
          {PRICING.map((p) => {
            const selected = selectedPlan === p.plan;
            const isYear = p.plan === "yearly";
            return (
              <TouchableOpacity
                key={p.plan}
                testID={`sub-plan-${p.plan}`}
                onPress={() => setSelectedPlan(p.plan)}
                activeOpacity={0.85}
                style={{ marginBottom: 10 }}
              >
                <Card style={[
                  styles.planCard,
                  selected && { borderWidth: 1.5, borderColor: COLORS.gold, backgroundColor: COLORS.gold + "10" },
                ]}>
                  {isYear && (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestBadgeText}>BEST VALUE</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planLabel}>{p.label}</Text>
                      <Text style={styles.planBadge}>{p.badge}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.planPrice}>{formatPrice(p.price, user?.country)}</Text>
                      {p.per && <Text style={styles.planPer}>{formatPrice(p.per, user?.country)}/mo</Text>}
                    </View>
                    {selected && (
                      <View style={styles.check}>
                        <Ionicons name="checkmark" size={16} color={COLORS.void} />
                      </View>
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}

          <FilledButton
            testID="subscription-upgrade"
            label={busy ? "Processing..." : isPremium ? "Change / Renew Plan" : "Upgrade Now ✦"}
            onPress={doSubscribe}
            disabled={busy}
            style={{ marginTop: 8 }}
          />
          <GhostButton
            testID="subscription-cancel"
            label="Maybe later"
            onPress={() => router.back()}
            style={{ marginTop: 10 }}
          />
          <Text style={styles.note}>
            Payments are processed via Google Play Billing. You can manage your subscription anytime in Play Store settings.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "800" },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusLabel: { color: COLORS.gray2, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  statusValue: { color: COLORS.white, fontSize: 22, fontWeight: "900", marginTop: 4 },
  statusExpiry: { color: COLORS.gray1, fontSize: 12, marginTop: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  section: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 24, marginBottom: 10 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  benefitIcon: { width: 32, height: 32, borderRadius: 999, backgroundColor: COLORS.gold + "20", alignItems: "center", justifyContent: "center" },
  benefitText: { color: COLORS.white, fontSize: 14, flex: 1 },
  planCard: { padding: 18 },
  bestBadge: { position: "absolute", top: -8, right: 12, backgroundColor: COLORS.gold, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  bestBadgeText: { color: COLORS.void, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  planLabel: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  planBadge: { color: COLORS.gray1, fontSize: 12, marginTop: 4 },
  planPrice: { color: COLORS.gold, fontSize: 22, fontWeight: "900" },
  planPer: { color: COLORS.gray2, fontSize: 11, marginTop: 2 },
  check: { width: 28, height: 28, borderRadius: 999, backgroundColor: COLORS.gold, alignItems: "center", justifyContent: "center", marginLeft: 10 },
  note: { color: COLORS.gray2, fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 18 },
});
