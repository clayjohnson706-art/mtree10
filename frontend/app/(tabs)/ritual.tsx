import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, InteractionManager } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated from "react-native-reanimated";
import { COLORS, DEITIES, GOAL_CATEGORIES, SACRIFICE_CATEGORIES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { DeityStone } from "@/src/components/DeityStone";
import SwipeNav from "@/src/components/SwipeNav";
import { Card, FilledButton } from "@/src/components/ui";
import SacredCommitmentCard from "@/src/components/SacredCommitmentCard";
import Skeleton from "@/src/components/Skeleton";
import { api } from "@/src/utils/api";
import { fetchUiStrings, fillSacrificeTemplate, fetchCategoryLabels, DEFAULT_UI_STRINGS, UiStrings } from "@/src/utils/uiStrings";
import { useAuth } from "@/src/context/AuthContext";
import { useManifestation } from "@/src/context/ManifestationContext";
import { useDoubleBackExit } from "@/src/hooks/use-double-back-exit";

type Manifestation = any;

// Shared with Home's skeleton hint (same underlying fact: does the user have an active
// manifestation) so whichever screen loads first benefits the other.
const HAD_ACTIVE_CACHE_KEY = "home_had_active_manifestation";

const getLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const shortLang = (code?: string) => (code || "english").slice(0, 2).toUpperCase();

// The core philosophy, told as a visual step-by-step journey (icon + short bold title + one-line
// caption each, connected by a flow line) instead of a wall of text — shown only when the user
// has no active manifestation yet.
const PHILOSOPHY_STEPS: { emoji: string; title: string; caption: string; accent: string }[] = [
  { emoji: "🎯", title: "Clear Goal", caption: "You need a clear-cut goal", accent: COLORS.gold },
  { emoji: "🔥", title: "Sacrifice", caption: "Link something you sacrifice to your goal", accent: COLORS.warning },
  { emoji: "🧠", title: "Mind Link", caption: "Connect sacrifice to goal in your mind", accent: COLORS.electric },
  { emoji: "🔄", title: "Consistency", caption: "Say affirmations several times daily", accent: COLORS.success },
  { emoji: "⚡", title: "More Power", caption: "Light one-day fasting linked to goal", accent: COLORS.gold },
  { emoji: "💪", title: "Daily Hustle", caption: "Add daily pain/effort to goal mentally", accent: COLORS.warning },
];

export default function Ritual() {
  const router = useRouter();
  const { user } = useAuth();
  const { toastStyle: exitToastStyle } = useDoubleBackExit();
  // Shared across Home/Ritual/Settings — see ManifestationContext. Reacts instantly when
  // another tab deletes/completes/creates a manifestation, instead of only refreshing once
  // this tab regains focus.
  const { active, refresh: refreshManifestation } = useManifestation();
  const [loaded, setLoaded] = useState(false);
  // Best-guess of whether THIS load will resolve to an active manifestation, read from the
  // previous session's outcome — used only to pick which skeleton shape (pre- vs post-selection)
  // to render while `loaded` is false; `active` above is always the source of truth once the
  // fetch resolves.
  const [hadActiveHint, setHadActiveHint] = useState(false);
  const [affirmationText, setAffirmationText] = useState<string | null>(null);
  const [ritualDone, setRitualDone] = useState(false);
  const [uiStrings, setUiStrings] = useState<UiStrings>(DEFAULT_UI_STRINGS);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const deity = DEITIES.find((d) => d.id === user?.deity_id) || DEITIES[0];

  useEffect(() => {
    AsyncStorage.getItem(HAD_ACTIVE_CACHE_KEY)
      .then((raw) => { if (raw != null) setHadActiveHint(raw === "true"); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const lang = user?.affirmation_language || "english";
      fetchUiStrings(lang).then(setUiStrings).catch(() => {});
      fetchCategoryLabels(lang).then(setCategoryLabels).catch(() => {});
      const m = await refreshManifestation();
      AsyncStorage.setItem(HAD_ACTIVE_CACHE_KEY, JSON.stringify(!!m)).catch(() => {});
      const todayLocal = getLocalDateStr(new Date());
      let doneToday = false;
      if (m?.last_ritual_local_date) {
        doneToday = m.last_ritual_local_date === todayLocal;
      } else if (m?.last_ritual_at) {
        doneToday = getLocalDateStr(new Date(m.last_ritual_at)) === todayLocal;
      }
      setRitualDone(doneToday);
      if (m?.goal_category) {
        if (m.affirmation_custom) {
          setAffirmationText(m.affirmation_custom);
        } else if (m.affirmation_enabled) {
          try {
            const a = await api<any>(`/affirmations/${m.goal_category}?language=${lang}`);
            setAffirmationText(a?.text ?? null);
          } catch { setAffirmationText(null); }
        } else {
          setAffirmationText(null);
        }
      } else {
        setAffirmationText(null);
      }
    } catch {
      // refreshManifestation already leaves context state consistent on failure.
    } finally {
      setLoaded(true);
    }
  }, [user?.affirmation_language]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(load);
      return () => task.cancel();
    }, [load])
  );

  const goalCat = active ? GOAL_CATEGORIES.find((g) => g.key === active.goal_category) : null;
  const sacCat = active ? SACRIFICE_CATEGORIES.find((s) => s.key === active.sacrifice_category) : null;
  const goalLabel = active ? (active.goal_category === "custom" ? (active.goal_custom || "your goal") : (goalCat?.label || "your goal")) : "";
  const sacrificeLabel = active ? (active.sacrifice_category === "custom" ? (active.sacrifice_custom || "your sacrifice") : (sacCat?.label || "your sacrifice")) : "";
  // Translated variants — used ONLY inside the sacrifice-affirmation sentence below, so the
  // actual goal/sacrifice NAME shows in the selected language too (not just the surrounding
  // template words). "Custom" entries are the user's own free text and stay as typed.
  const goalLabelTranslated = active && active.goal_category !== "custom"
    ? (categoryLabels[active.goal_category] || goalLabel)
    : goalLabel;
  const sacrificeLabelTranslated = active && active.sacrifice_category !== "custom"
    ? (categoryLabels[active.sacrifice_category] || sacrificeLabel)
    : sacrificeLabel;

  return (
    <View style={styles.container} testID="ritual-screen">
      <AnimatedBackground deityColor={deity.color} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <SwipeNav screen="ritual">
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Ritual</Text>
              <Text style={styles.subtitle}>Your daily practice, in full</Text>
            </View>

            {!loaded ? (
              hadActiveHint ? (
                // Skeleton — reuses the EXACT same style objects as the real cards below
                // (styles.affirmCard, styles.sacrificeCard, styles.gsRow/iconTile) so every
                // placeholder is pixel-identical in size to what it's about to be replaced by;
                // nothing pops in at a different size, and the tab is never blank while loading.
                <View testID="ritual-skeleton">
                  <View style={{ alignItems: "center", marginTop: 8, marginBottom: 18 }}>
                    <Skeleton style={{ width: 96, height: 96, borderRadius: 48 }} />
                    <Skeleton style={{ width: 150, height: 16, marginTop: 12, borderRadius: 4 }} />
                    <Skeleton style={{ width: 190, height: 26, marginTop: 10, borderRadius: 999 }} />
                  </View>

                  <Card style={styles.affirmCard}>
                    <View style={styles.affirmHeader}>
                      <Skeleton style={{ width: 140, height: 11 }} />
                      <Skeleton style={{ width: 30, height: 18, borderRadius: 999 }} />
                    </View>
                    <Skeleton style={{ width: "100%", height: 18, marginBottom: 8 }} />
                    <Skeleton style={{ width: "90%", height: 18, marginBottom: 8 }} />
                    <Skeleton style={{ width: "55%", height: 18, marginBottom: 16 }} />
                    <Skeleton style={{ width: 220, height: 13, alignSelf: "center" }} />
                  </Card>

                  <Card style={styles.sacrificeCard}>
                    <Skeleton style={{ width: "100%", height: 15, marginBottom: 8 }} />
                    <Skeleton style={{ width: "65%", height: 15, marginBottom: 12 }} />
                    <Skeleton style={{ width: "45%", height: 13, marginBottom: 12 }} />
                    <Skeleton style={{ width: 200, height: 13, alignSelf: "center" }} />
                  </Card>

                  <View style={styles.gsRow}>
                    <SkeletonIconTile />
                    <SkeletonIconTile />
                  </View>
                  <View style={[styles.gsRow, { marginTop: 10 }]}>
                    <SkeletonIconTile />
                    <SkeletonIconTile />
                  </View>
                </View>
              ) : (
                // Pre-selection skeleton — matches the "no active manifestation" philosophy-journey
                // layout below (styles.journeyHeroWrap, styles.journeyCard × 6, styles.gotoHomeBox)
                // instead of the post-selection shape above, so a user with no manifestation yet
                // doesn't get an entirely mismatched skeleton while this loads.
                <View testID="ritual-skeleton-preselection">
                  <View style={styles.journeyHeroWrap}>
                    <Skeleton style={{ width: 40, height: 40, borderRadius: 20, marginBottom: 10 }} />
                    <Skeleton style={{ width: 220, height: 15 }} />
                  </View>
                  <View style={styles.journeyFlow}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <View key={n} style={styles.journeyCard}>
                        <Skeleton style={{ width: 46, height: 46, borderRadius: 999 }} />
                        <View style={{ flex: 1 }}>
                          <Skeleton style={{ width: 90, height: 14.5, marginBottom: 4 }} />
                          <Skeleton style={{ width: "80%", height: 11.5 }} />
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={[styles.gotoHomeBox, { backgroundColor: "transparent" }]}>
                    <Skeleton style={{ width: "100%", height: 20, borderRadius: 8 }} />
                  </View>
                </View>
              )
            ) : active ? (
              <>
                <View style={{ alignItems: "center", marginTop: 8, marginBottom: 18 }}>
                  <DeityStone deityName={deity.name} color={deity.color} glow={deity.glow} size={96} glowIntensity={1.3} />
                  <Text style={[styles.deityName, { color: deity.color }]}>{deity.name.toUpperCase().split("").join(" ")}</Text>
                  <View style={[styles.statusPill, { backgroundColor: (ritualDone ? COLORS.success : COLORS.warning) + "20" }]} testID="ritual-status-pill">
                    <Ionicons name={ritualDone ? "checkmark-circle" : "time-outline"} size={13} color={ritualDone ? COLORS.success : COLORS.warning} />
                    <Text style={{ color: ritualDone ? COLORS.success : COLORS.warning, fontSize: 12, fontWeight: "800", marginLeft: 5 }}>
                      {ritualDone ? "Today's ritual complete" : "Today's ritual pending"}
                    </Text>
                  </View>
                </View>

                <SacredCommitmentCard
                  testID="ritual-sacred-commitment"
                  burningDesire={active.burning_desire || active.goal_description}
                  affirmation={affirmationText}
                  sacrifice={fillSacrificeTemplate(uiStrings.sacrifice_template, sacrificeLabelTranslated, goalLabelTranslated)}
                />

                <Card style={styles.chantCard} testID="ritual-chant-card">
                  <Text style={styles.affirmHeadLabel}>✦ HOW TO PRACTICE</Text>
                  <View style={styles.practiceList}>
                    <PracticeRow
                      icon="repeat"
                      color={COLORS.gold}
                      title="Mental Chanting — 10×"
                      body="Every time a notification arrives (or the urge strikes), chant your affirmation 10 times in your mind. Repetition is how the mind rewires."
                    />
                    <PracticeRow
                      icon="sunny"
                      color={COLORS.warning}
                      title="Wake-Up Power"
                      body="Right after waking, your subconscious is at its most receptive. Morning chanting programs the tone of your entire day."
                    />
                    <PracticeRow
                      icon="moon"
                      color={COLORS.electric}
                      title="Bedtime Power"
                      body="Your subconscious processes your last thoughts all through sleep. Chanting before bed plants your desire the deepest."
                    />
                    <PracticeRow
                      icon="infinite"
                      color={COLORS.success}
                      title="Consistency Compounds"
                      body="Each repetition deepens the neural pathway. This is exactly how habits and beliefs are rewired — never skip a day."
                    />
                    <PracticeRow
                      icon="eye"
                      color={COLORS.cyan}
                      title="Visualize It Done"
                      body="While chanting, see your desire as ALREADY achieved — feel it, hear it, live it with all senses. Emotion is the amplifier."
                    />
                  </View>
                  <Text style={styles.boldInstruction}>{uiStrings.chant_this_10_too}</Text>
                </Card>

                <View style={styles.gsRow}>
                  <IconTile emoji={goalCat?.emoji ?? "🎯"} label="GOAL" value={goalLabel} />
                  <IconTile emoji={sacCat?.emoji ?? "🔥"} label="SACRIFICE" value={sacrificeLabel} />
                </View>
                <View style={[styles.gsRow, { marginTop: 10 }]}>
                  <IconTile
                    icon={active.fasting_enabled ? "restaurant" : "restaurant-outline"}
                    label="FASTING"
                    value={active.fasting_enabled ? "Linked ✓" : "Not linked"}
                    color={active.fasting_enabled ? COLORS.success : undefined}
                  />
                  <IconTile
                    icon="barbell-outline"
                    label="HUSTLE"
                    value={active.hustle_enabled ? "Linked ✓" : "Not linked"}
                    color={active.hustle_enabled ? COLORS.success : undefined}
                  />
                </View>

                {!ritualDone && (
                  <FilledButton
                    testID="ritual-go-to-home"
                    label="Go Perform Today's Ritual →"
                    onPress={() => router.push("/(tabs)/home")}
                    style={{ marginTop: 20, alignSelf: "stretch" }}
                  />
                )}
              </>
            ) : (
              <>
                <View style={styles.journeyHeroWrap}>
                  <LinearGradient colors={[COLORS.gold + "26", "transparent"]} style={styles.journeyHeroGlow} />
                  <Text style={styles.journeyHeroEmoji}>📿</Text>
                  <Text style={styles.philosophyIntro}>
                    How manifestation works, in 6 steps
                  </Text>
                </View>

                <View style={styles.journeyFlow} testID="ritual-philosophy-journey">
                  {PHILOSOPHY_STEPS.map((c, i) => (
                    <Card key={c.title} style={styles.journeyCard} testID={`ritual-philosophy-${c.title.replace(/\s|\+/g, "-")}`}>
                      <LinearGradient colors={[c.accent + "1E", "transparent"]} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
                      <View style={[styles.journeyNumBadge, { backgroundColor: c.accent }]}>
                        <Text style={styles.journeyDotNum}>{i + 1}</Text>
                      </View>
                      <View style={[styles.journeyIconWrap, { backgroundColor: c.accent + "24", shadowColor: c.accent }]}>
                        <Text style={styles.journeyEmoji}>{c.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.journeyCardTitle, { color: c.accent }]}>{c.title}</Text>
                        <Text style={styles.journeyCardCaption}>{c.caption}</Text>
                      </View>
                    </Card>
                  ))}
                </View>

                <View style={styles.gotoHomeBox} testID="ritual-goto-home-message">
                  <Ionicons name="home" size={20} color={COLORS.gold} />
                  <Text style={styles.gotoHomeText}>Go to the Home screen to begin your manifestation</Text>
                </View>
              </>
            )}
          </ScrollView>
        </SwipeNav>
      </SafeAreaView>

      <Animated.View pointerEvents="none" testID="ritual-exit-toast" style={[styles.exitToast, exitToastStyle]}>
        <Text style={styles.exitToastText}>Press back again to exit</Text>
      </Animated.View>
    </View>
  );
}

function PracticeRow({ icon, color, title, body }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; body: string }) {
  return (
    <View style={styles.practiceRow}>
      <View style={[styles.practiceIcon, { backgroundColor: color + "1E", borderColor: color + "44" }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.practiceTitle, { color }]}>{title}</Text>
        <Text style={styles.practiceBody}>{body}</Text>
      </View>
    </View>
  );
}

function IconTile({
  icon, emoji, label, value, color,
}: { icon?: keyof typeof Ionicons.glyphMap; emoji?: string; label: string; value: string; color?: string }) {
  return (
    <View style={styles.iconTile}>
      <View style={styles.iconTileIcon}>
        {emoji ? <Text style={{ fontSize: 20 }}>{emoji}</Text> : icon ? <Ionicons name={icon} size={20} color={COLORS.gold} /> : null}
      </View>
      <Text style={styles.iconTileLabel}>{label}</Text>
      <Text style={[styles.iconTileValue, color && { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// Same `iconTile`/`iconTileIcon` containers as the real IconTile above — guarantees the
// skeleton tile is pixel-identical in size to the real one it precedes.
function SkeletonIconTile() {
  return (
    <View style={styles.iconTile}>
      <View style={styles.iconTileIcon} />
      <Skeleton style={{ width: 46, height: 9.5 }} />
      <Skeleton style={{ width: 66, height: 13 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { marginBottom: 6 },
  title: { color: COLORS.white, fontSize: 28, fontWeight: "900" },
  subtitle: { color: COLORS.gray2, fontSize: 12, marginTop: 4, marginBottom: 6 },
  deityName: { fontSize: 16, fontWeight: "300", letterSpacing: 5, fontStyle: "italic", marginTop: 12, textAlign: "center" },
  statusPill: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },

  affirmCard: { padding: 20, overflow: "hidden", borderRadius: 20, marginBottom: 14 },
  affirmHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  affirmHeadLabel: { color: COLORS.gold, fontSize: 11, fontWeight: "800", letterSpacing: 2, textAlign: "center" },
  affirmBigText: { color: COLORS.white, fontSize: 18, fontStyle: "italic", lineHeight: 27, fontWeight: "500", textAlign: "center" },
  langPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: COLORS.surface2 },
  langText: { color: COLORS.gray1, fontSize: 10, fontWeight: "700" },
  boldInstruction: { color: COLORS.gold, fontSize: 13, fontWeight: "800", marginTop: 14, textAlign: "center" },
  mutedText: { color: COLORS.gray1, fontSize: 13, marginTop: 8, lineHeight: 20, textAlign: "center" },

  sacrificeCard: { padding: 18, marginBottom: 14, backgroundColor: COLORS.gold + "10", alignItems: "center" },
  chantCard: { padding: 18, marginTop: 14, marginBottom: 14, backgroundColor: COLORS.gold + "10", alignItems: "center" },
  practiceList: { alignSelf: "stretch", marginTop: 14, gap: 14 },
  practiceRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  practiceIcon: {
    width: 36, height: 36, borderRadius: 12, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  practiceTitle: { fontSize: 14, fontWeight: "900" },
  practiceBody: { color: COLORS.gray1, fontSize: 12.5, lineHeight: 18.5, marginTop: 3 },
  sacrificeBold: { color: COLORS.white, fontSize: 15, fontWeight: "800", lineHeight: 22, textAlign: "center" },

  gsRow: { flexDirection: "row", gap: 10 },
  iconTile: { flex: 1, backgroundColor: COLORS.surface2, borderRadius: 16, padding: 14, alignItems: "center", gap: 6 },
  iconTileIcon: { width: 40, height: 40, borderRadius: 999, backgroundColor: COLORS.gold + "18", alignItems: "center", justifyContent: "center" },
  iconTileLabel: { color: COLORS.gray2, fontSize: 9.5, fontWeight: "700", letterSpacing: 1.5 },
  iconTileValue: { color: COLORS.white, fontSize: 13, fontWeight: "700", textAlign: "center" },

  philosophyIntro: { color: COLORS.gray1, fontSize: 14, lineHeight: 21, textAlign: "center", fontWeight: "700" },
  journeyHeroWrap: { alignItems: "center", marginTop: 6, marginBottom: 22 },
  journeyHeroGlow: { position: "absolute", top: -30, width: 220, height: 140, borderRadius: 999 },
  journeyHeroEmoji: { fontSize: 40, marginBottom: 10 },

  journeyFlow: { marginBottom: 8 },
  journeyNumBadge: {
    position: "absolute", top: 10, left: 10, width: 20, height: 20, borderRadius: 999,
    alignItems: "center", justifyContent: "center", zIndex: 1,
  },
  journeyDotNum: { color: COLORS.void, fontSize: 11, fontWeight: "900" },
  journeyCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, paddingLeft: 38,
    borderRadius: 16, marginBottom: 14, overflow: "hidden", position: "relative",
  },
  journeyIconWrap: {
    width: 46, height: 46, borderRadius: 999, alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.6, shadowRadius: 8, elevation: 3,
  },
  journeyEmoji: { fontSize: 22 },
  journeyCardTitle: { fontSize: 14.5, fontWeight: "900", marginBottom: 2 },
  journeyCardCaption: { color: COLORS.gray2, fontSize: 11.5, lineHeight: 15 },

  gotoHomeBox: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 18, paddingHorizontal: 16, borderRadius: 16,
    backgroundColor: COLORS.gold + "14", marginTop: 6,
  },
  gotoHomeText: { color: COLORS.white, fontSize: 14.5, fontWeight: "800", textAlign: "center", flexShrink: 1 },

  exitToast: { position: "absolute", bottom: 110, left: 24, right: 24, alignItems: "center" },
  exitToastText: {
    backgroundColor: "#000000CC", color: COLORS.white, fontSize: 13, fontWeight: "600",
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, overflow: "hidden",
  },
});
