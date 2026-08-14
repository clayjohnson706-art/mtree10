import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, PRICING } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { Card, FilledButton, GhostButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

const BENEFITS = [
  "✦ Daily Affirmations (Hindi & English audio)",
  "✦ Custom Reminders (1-5x per day + busy hours)",
  "✦ Manifestation Wall (See what others achieve)",
  "✦ Cosmic Leaderboard",
  "✦ Save & Inspire",
];

export default function Paywall() {
  const router = useRouter();
  const { subscribe, user } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [selectedPlan, setSelectedPlan] = React.useState<string>("first_month");

  // Internal testing phase: everyone is granted premium on signup (no real billing yet),
  // so skip the purchase screen entirely instead of showing a confusing fake checkout.
  React.useEffect(() => {
    if (user?.is_premium) router.replace("/deity");
  }, [user?.is_premium]);

  const doSubscribe = async () => {
    setBusy(true);
    try {
      await subscribe(selectedPlan);
      router.replace("/deity");
    } finally { setBusy(false); }
  };

  const skip = () => router.replace("/deity");

  return (
    <View style={styles.container} testID="paywall-screen">
      <AnimatedBackground deityColor={COLORS.gold} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
          <Text style={styles.title}>Unlock the full{'\n'}experience</Text>
          <Card style={{ marginTop: 24 }}>
            <Text style={styles.label}>PREMIUM INCLUDES</Text>
            {BENEFITS.map((b) => (
              <Text key={b} style={styles.benefit}>{b}</Text>
            ))}
          </Card>

          <Text style={[styles.label, { marginTop: 24 }]}>CHOOSE PLAN</Text>
          {PRICING.map((p) => {
            const isFirst = p.plan === "first_month";
            const alreadyUsedFirst = false; // new user only anyway
            if (isFirst && alreadyUsedFirst) return null;
            const selected = selectedPlan === p.plan;
            return (
              <Card
                key={p.plan}
                testID={`plan-${p.plan}`}
                onPress={() => setSelectedPlan(p.plan)}
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: selected ? COLORS.gold : "transparent",
                  backgroundColor: selected ? COLORS.gold + "10" : COLORS.surface1,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={styles.planLabel}>{p.label}</Text>
                    <Text style={styles.planBadge}>{p.badge}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.planPrice}>₹{p.price}</Text>
                    {p.per && <Text style={styles.planPer}>₹{p.per}/mo</Text>}
                  </View>
                </View>
              </Card>
            );
          })}
        </ScrollView>
        <View style={styles.footer}>
          <FilledButton
            testID="paywall-subscribe"
            label={busy ? "Processing..." : "Get Premium ✦"}
            onPress={doSubscribe}
            disabled={busy}
          />
          <GhostButton
            testID="paywall-skip"
            label="Start Free"
            onPress={skip}
            style={{ marginTop: 10 }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  title: { color: COLORS.white, fontSize: 32, fontWeight: "900", marginTop: 16, lineHeight: 40 },
  label: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 8 },
  benefit: { color: COLORS.white, fontSize: 14, marginTop: 8, lineHeight: 22 },
  planLabel: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  planBadge: { color: COLORS.gray1, fontSize: 12, marginTop: 4 },
  planPrice: { color: COLORS.gold, fontSize: 22, fontWeight: "900" },
  planPer: { color: COLORS.gray2, fontSize: 11, marginTop: 2 },
  footer: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 8 },
});
