import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, FONTS } from "@/src/theme";
import { Card } from "@/src/components/ui";

// "Your Sacred Commitment" — the ONE combined card (Burning Desire → Affirmation → Sacrifice,
// always in that order) shown on Home, Ritual, notification cards and the ritual-success modal.
// The affirmation is rendered CENTERED in the calm Lora serif (app-wide rule), while desire and
// sacrifice stay ultra-visible gold statements.
export default function SacredCommitmentCard({
  burningDesire,
  affirmation,
  sacrifice,
  testID = "sacred-commitment-card",
  compact = false,
}: {
  burningDesire?: string | null;
  affirmation?: string | null;
  sacrifice?: string | null;
  testID?: string;
  compact?: boolean;
}) {
  return (
    <Card testID={testID} style={[styles.card, compact && styles.compact]}>
      <LinearGradient
        colors={[COLORS.gold + "1C", "rgba(0,0,0,0)", COLORS.electric + "12"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={styles.headingRow}>
        <View style={styles.headingIcon}>
          <Ionicons name="diamond" size={15} color={COLORS.gold} />
        </View>
        <Text style={styles.heading}>Your Sacred Commitment</Text>
      </View>

      {/* 1 — Burning Desire (centered — identical treatment to the affirmation) */}
      <View testID={`${testID}-burning-desire`} style={[styles.row, styles.centerBlock]}>
        <View style={[styles.labelRow, { justifyContent: "center" }]}>
          <Ionicons name="heart" size={13} color={COLORS.danger} />
          <Text style={styles.label}>BURNING DESIRE</Text>
        </View>
        <Text style={[styles.value, compact && styles.compactValue]}>
          {burningDesire || "Hold your deepest reason clearly in your heart."}
        </Text>
      </View>

      {/* 2 — Affirmation (centered, Lora serif — consistent everywhere in the app) */}
      <View testID={`${testID}-affirmation`} style={[styles.row, styles.divider, styles.affirmationBlock]}>
        <View style={[styles.labelRow, { justifyContent: "center" }]}>
          <Ionicons name="sparkles" size={13} color={COLORS.gold} />
          <Text style={styles.label}>AFFIRMATION</Text>
        </View>
        <Text style={[styles.affirmationText, compact && styles.affirmationCompact]}>
          “{affirmation || "My intention is clear and my disciplined actions support it."}”
        </Text>
      </View>

      {/* 3 — Sacrifice (centered — identical treatment to the affirmation) */}
      <View testID={`${testID}-sacrifice`} style={[styles.row, styles.divider, styles.centerBlock]}>
        <View style={[styles.labelRow, { justifyContent: "center" }]}>
          <Ionicons name="flame" size={13} color={COLORS.warning} />
          <Text style={styles.label}>SACRIFICE</Text>
        </View>
        <Text style={[styles.value, compact && styles.compactValue]}>
          {sacrifice || "Honor the sacrifice you chose for this journey."}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 22, overflow: "hidden", borderColor: COLORS.gold + "3A" },
  compact: { padding: 18 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 4 },
  headingIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.gold + "1E",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.gold + "40",
  },
  heading: { color: COLORS.white, fontSize: 18, fontWeight: "900", letterSpacing: 0.2 },
  row: { paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { color: COLORS.gray1, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.8 },
  // §2 (font parity): Burning Desire, Affirmation and Sacrifice share ONE identical text
  // treatment — same Lora serif, same size/line-height/letter-spacing, same centered gold.
  value: {
    fontFamily: FONTS.affirmationItalic,
    color: COLORS.gold,
    fontSize: 20,
    lineHeight: 31,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  compactValue: { fontSize: 18, lineHeight: 28 },
  centerBlock: { alignItems: "center" },
  affirmationBlock: { alignItems: "center" },
  // §7 + §11: affirmation text is ALWAYS centered and set in Lora — a readability-proven,
  // calm serif — with generous 1.5x line height and ≥20sp size.
  affirmationText: {
    fontFamily: FONTS.affirmationItalic,
    color: COLORS.gold,
    fontSize: 20,
    lineHeight: 31,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  affirmationCompact: { fontSize: 18, lineHeight: 28 },
});
