import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { COLORS, DEITIES, GOAL_CATEGORIES, SACRIFICE_CATEGORIES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import SacredCommitmentCard from "@/src/components/SacredCommitmentCard";
import HoldProgressButton from "@/src/components/HoldProgressButton";
import { Card } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/utils/api";
import { dismissDeliveredNotification } from "@/src/utils/notifications";
import { DEFAULT_UI_STRINGS, fetchCategoryLabels, fetchUiStrings, fillSacrificeTemplate } from "@/src/utils/uiStrings";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ALARM_SOUND = require("../assets/sounds/alarm.wav");

export default function RitualReminder() {
  const router = useRouter();
  const { kind = "reminder", eventId = "reminder" } = useLocalSearchParams<{ kind?: string; eventId?: string }>();
  const { user, loading: authLoading } = useAuth();
  const [active, setActive] = useState<any>(null);
  const [affirmation, setAffirmation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sacrificeText, setSacrificeText] = useState("");
  const deity = DEITIES.find((item) => item.id === user?.deity_id) || DEITIES[0];

  const isAlarm = kind === "wake" || kind === "sleep";
  const title = kind === "wake" ? "Rise With Intention" : kind === "sleep" ? "Rest In Sacred Trust" : "Return To Your Intention";

  // Wake-up & bedtime ONLY: continuous alarm — the sound LOOPS and keeps ringing until the
  // user completes the hold (a single tap can never stop it). Stops automatically only when
  // this screen unmounts (expo-audio releases the player with the component).
  const player = useAudioPlayer(ALARM_SOUND);
  useEffect(() => {
    if (!isAlarm || Platform.OS === "web") return;
    try {
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      player.loop = true;
      player.play();
    } catch {}
    return () => { try { player.pause(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlarm]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const language = user?.affirmation_language || "english";
        const [manifestation, strings, labels] = await Promise.all([
          api<any>("/manifestations/active"),
          fetchUiStrings(language).catch(() => DEFAULT_UI_STRINGS),
          fetchCategoryLabels(language).catch(() => ({} as Record<string, string>)),
        ]);
        if (cancelled) return;
        setActive(manifestation);
        if (manifestation?.affirmation_custom) setAffirmation(manifestation.affirmation_custom);
        else if (manifestation?.goal_category && manifestation?.affirmation_enabled) {
          const result = await api<any>(`/affirmations/${manifestation.goal_category}?language=${language}`);
          if (!cancelled) setAffirmation(result?.text || null);
        }
        if (manifestation) {
          const goal = manifestation.goal_category === "custom"
            ? (manifestation.goal_custom || "your goal")
            : (labels[manifestation.goal_category] || GOAL_CATEGORIES.find((g) => g.key === manifestation.goal_category)?.label || "your goal");
          const sacrifice = manifestation.sacrifice_category === "custom"
            ? (manifestation.sacrifice_custom || "your sacrifice")
            : (labels[manifestation.sacrifice_category] || SACRIFICE_CATEGORIES.find((s) => s.key === manifestation.sacrifice_category)?.label || "your sacrifice");
          setSacrificeText(fillSacrificeTemplate(strings.sacrifice_template, sacrifice, goal));
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.affirmation_language]);

  const complete = async () => {
    // Silence the alarm the instant the hold completes.
    try { player.pause(); } catch {}
    if (!active?.id) { router.replace("/(tabs)/home"); return; }
    setSaving(true);
    try {
      const date = new Date();
      const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      await api(`/manifestations/${active.id}/notification-response`, {
        method: "POST",
        body: { event_id: `${eventId}-${localDate}`, local_date: localDate, kind },
      });
      await dismissDeliveredNotification(eventId);
      router.replace("/(tabs)/home");
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.container} testID="ritual-reminder-screen">
      <AnimatedBackground deityColor={deity.color} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Card style={styles.outer} testID="ritual-reminder-card">
            {loading || authLoading ? (
              <ActivityIndicator testID="ritual-reminder-loading" color={COLORS.gold} />
            ) : (
              <>
                <View style={[styles.iconWrap, { backgroundColor: (isAlarm ? COLORS.gold : deity.color) + "1F" }]}>
                  <Ionicons name={kind === "wake" ? "sunny" : kind === "sleep" ? "moon" : "notifications"} size={30} color={isAlarm ? COLORS.gold : deity.color} />
                </View>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>
                  {kind === "wake"
                    ? "Your morning ritual begins now — your subconscious is most receptive at dawn."
                    : kind === "sleep"
                    ? "Your last thoughts shape tomorrow — plant your desire as you drift into sleep."
                    : "Pause with presence. Your response strengthens your notification streak."}
                </Text>
                {active ? (
                  <SacredCommitmentCard
                    testID="notification-sacred-commitment"
                    compact
                    burningDesire={active.burning_desire || active.goal_description}
                    affirmation={affirmation}
                    sacrifice={sacrificeText}
                  />
                ) : (
                  <Text style={styles.fallback}>Breathe, remember your intention, and choose one aligned action.</Text>
                )}
                {/* Gentle practice instruction — on EVERY notification card that shows text */}
                <View style={styles.chantRow} testID="ritual-reminder-chant-instruction">
                  <Text style={styles.chantIcon}>🧠</Text>
                  <Text style={styles.chantText}>Chant this in your mind 10 times</Text>
                  <Text style={styles.chantIcon}>✨</Text>
                </View>
                <Text style={styles.holdWhy}>
                  {isAlarm
                    ? "The alarm keeps ringing until you hold — a tap is not enough. This sacred moment deserves your full presence."
                    : "Hold to confirm — this sacred moment deserves your full intention and presence."}
                </Text>
              </>
            )}
            <HoldProgressButton
              testID="ritual-reminder-hold-done"
              label={saving ? "SAVING..." : isAlarm ? "HOLD TO STOP" : "HOLD TO MARK DONE"}
              onComplete={complete}
              disabled={loading || authLoading || saving}
              style={{ marginTop: 20, alignSelf: "stretch" }}
            />
          </Card>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", padding: 20 },
  outer: { padding: 22, alignItems: "center", overflow: "hidden" },
  iconWrap: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.white, fontSize: 25, fontWeight: "900", textAlign: "center", marginTop: 16 },
  subtitle: { color: COLORS.gray1, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8, marginBottom: 18 },
  fallback: { color: COLORS.gold, fontSize: 20, fontWeight: "900", lineHeight: 28, textAlign: "center", paddingVertical: 28 },
  chantRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 14, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: COLORS.electric + "16", borderWidth: 1, borderColor: COLORS.electric + "35",
  },
  chantIcon: { fontSize: 13 },
  chantText: { color: COLORS.gray1, fontSize: 12.5, fontWeight: "700", letterSpacing: 0.3 },
  holdWhy: { color: COLORS.gray1, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: 14, fontWeight: "700" },
});
