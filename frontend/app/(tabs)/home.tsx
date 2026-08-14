import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, InteractionManager } from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  cancelAnimation,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, DEITIES, GOAL_CATEGORIES, SACRIFICE_CATEGORIES, LANGUAGES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import DeityHero from "@/src/components/DeityHero";
import { DeityStone } from "@/src/components/DeityStone";
import AppLogo from "@/src/components/AppLogo";
import SwipeNav from "@/src/components/SwipeNav";
import { Card, FilledButton } from "@/src/components/ui";
import { InfoModal } from "@/src/components/InfoModal";
import ReminderCenter from "@/src/components/ReminderCenter";
import JourneyIntroOverlay from "@/src/components/JourneyIntroOverlay";
import StreakDetailModal from "@/src/components/StreakDetailModal";
import SacredCommitmentCard from "@/src/components/SacredCommitmentCard";
import NotificationStreakCard from "@/src/components/NotificationStreakCard";
import Skeleton from "@/src/components/Skeleton";
import { getMoonPhase } from "@/src/utils/moon";
import { getSpiritualMoonDay, formatTodayLong } from "@/src/utils/spiritual-moon";
import { getMoonDetail, getCosmicMeaning } from "@/src/utils/moon-meanings";
import { getCosmicEnergy, nextCosmicUpdateMs } from "@/src/utils/cosmic";
import { api } from "@/src/utils/api";
import { scheduleStreakReminder } from "@/src/utils/notifications";
import { fetchUiStrings, fillSacrificeTemplate, fetchCategoryLabels, DEFAULT_UI_STRINGS, UiStrings } from "@/src/utils/uiStrings";
import { useAuth } from "@/src/context/AuthContext";
import { useManifestation } from "@/src/context/ManifestationContext";
import { useDoubleBackExit } from "@/src/hooks/use-double-back-exit";

type Manifestation = any;

// Local (device) calendar date as YYYY-MM-DD — used instead of UTC date comparisons
// so day-boundary/streak checks match the user's own timezone, not the server's.
const getLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Short 2-letter badge for the affirmation language pill (e.g. "EN", "HI", "TA").
const shortLang = (code?: string) => (code || "english").slice(0, 2).toUpperCase();

// Visual state for each circle in the Daily Streak card's connected "week strip".
function stripCircleStyle(status: "completed" | "next" | "upcoming", deityColor: string) {
  if (status === "completed") return { backgroundColor: deityColor, borderColor: deityColor };
  if (status === "next") return { backgroundColor: COLORS.gold + "18", borderColor: COLORS.gold, borderWidth: 2 };
  return { backgroundColor: COLORS.surface2, borderColor: COLORS.gray3 };
}

// Slightly smaller than before so the Deity card reads a touch more compact, and so the
// Daily Streak card below it fits fully on-screen without needing to scroll.
const DEITY_SIZE = 210;

// Persists whether the last successful load had an active manifestation, purely so the NEXT
// app open can pick the right skeleton shape (pre- vs post-selection) before the real fetch
// resolves — without this, a returning user with an active manifestation sees the pre-selection
// skeleton, then has the streak/journey cards pop in with no placeholder.
const HAD_ACTIVE_CACHE_KEY = "home_had_active_manifestation";

export default function Home() {
  const router = useRouter();
  const { toastStyle: exitToastStyle } = useDoubleBackExit();
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const { showJourneyIntro: showJourneyIntroParam } = useLocalSearchParams<{ showJourneyIntro?: string }>();
  // Shared across Home/Ritual/Settings so a mutation on one tab (delete, complete ritual,
  // create new) reaches the others immediately, not only once the user navigates to them.
  const { active, setActive, refresh: refreshManifestation } = useManifestation();
  // Distinguishes "haven't checked yet" from "confirmed there's no active manifestation" — the
  // empty "SET GOAL / SET SACRIFICE" prompt and the "Begin New Manifestation" bar must only ever
  // render once we've actually confirmed there's no active manifestation, never just because the
  // async /manifestations/active fetch hasn't resolved yet. Without this, every app reopen
  // (or tab refocus) briefly renders that empty/pre-manifestation state for however long the
  // fetch takes, THEN swaps to the real Goal/Sacrifice/streak content the instant it resolves —
  // a visible flash of the wrong screen.
  const [manifestLoaded, setManifestLoaded] = useState(false);
  // Best-guess of whether THIS load will resolve to an active manifestation, read from the
  // previous session's outcome — used only to pick which skeleton shape to render while
  // manifestLoaded is false; the real `active` state below is always the source of truth
  // once the fetch resolves.
  const [hadActiveHint, setHadActiveHint] = useState(false);
  const [affirmation, setAffirmation] = useState<{ text: string; language?: string } | null>(null);
  const [uiStrings, setUiStrings] = useState<UiStrings>(DEFAULT_UI_STRINGS);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const [cosmic, setCosmic] = useState(getCosmicEnergy());
  const [holding, setHolding] = useState(false);
  const [ritualDone, setRitualDone] = useState(false);
  const [showAffirmation, setShowAffirmation] = useState(false);
  const [showMoon, setShowMoon] = useState(false);
  const [showCosmic, setShowCosmic] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHustle, setShowHustle] = useState(false);
  const [showFasting, setShowFasting] = useState(false);
  const [showCameTrue, setShowCameTrue] = useState(false);
  const [holdingCameTrue, setHoldingCameTrue] = useState(false);
  const [confirmingCameTrue, setConfirmingCameTrue] = useState(false);
  // Post-ritual success card — "start" the very first time a manifestation's streak goes
  // from 0 (Hold to Start), "power" every subsequent day (Hold to Add Power). Decided from
  // the streak_count BEFORE the ritual API call updates it (captured in finishRitual()).
  const [showStreakCard, setShowStreakCard] = useState<null | "start" | "power">(null);
  const [showStreakDetail, setShowStreakDetail] = useState(false);
  const [showReminderCenter, setShowReminderCenter] = useState(false);
  const [busy, setBusyState] = useState(false);
  const moon = useMemo(() => getMoonPhase(), []);
  const spiritual = useMemo(() => getSpiritualMoonDay(), []);
  const todayStr = useMemo(() => formatTodayLong(), []);
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
      // Restore the persisted post-ritual glow immediately on load if today's ritual is already
      // done (e.g. app was fully closed and reopened) — without this, energyGlow's shared value
      // defaults back to 0 on every fresh mount and the intensified state is lost until the next
      // hold. Brightness only — glowScaleBoost/symbolPulse are left at their normal baseline, so
      // no scale/size change happens here, matching the persisted-brightness-only behavior.
      if (doneToday) {
        energyGlow.value = withTiming(0.7, { duration: 400 });
      }
      if (m?.goal_category && m?.affirmation_enabled) {
        // A user-written custom affirmation always takes priority over the stock library
        // affirmation for their goal category.
        if (m.affirmation_custom) {
          setAffirmation({ text: m.affirmation_custom, language: "custom" });
        } else {
          try {
            const a = await api<any>(`/affirmations/${m.goal_category}?language=${lang}`);
            setAffirmation(a);
          } catch {}
        }
      } else {
        setAffirmation(null);
      }
      // Self-corrects the local streak-reminder notification's scheduled date every time Home
      // is visited: already done today -> pushed to tomorrow evening; not done -> stays tonight
      // at the user's chosen local time. No server push needed to "know" this dynamically.
      if (user?.streak_reminder_enabled !== false) {
        scheduleStreakReminder(user?.streak_reminder_time ?? "20:00", doneToday).catch(() => {});
      }
    } catch (e) {
      console.warn("load failed", e);
    } finally {
      setManifestLoaded(true);
    }
  }, [user?.affirmation_language, user?.streak_reminder_enabled, user?.streak_reminder_time]);

  useFocusEffect(
    useCallback(() => {
      // Deferred so this fetch (+ its setState) waits until the tab-switch/slide animation has
      // actually settled instead of running on the same frames as it — reduces jank on rapid
      // tab navigation without meaningfully delaying Home's content (interactions finish fast).
      const task = InteractionManager.runAfterInteractions(load);
      return () => task.cancel();
    }, [load])
  );

  // Journey guidance — shown as an overlay EVERY time the user starts a new manifestation
  // journey (not just the first ever), right when manifest-setup.tsx redirects here immediately
  // after completing a new set of Goal/Sacrifice/Daily Commitment/Hustle/Fasting selections —
  // never during login, onboarding, or a plain Home visit/reopen. Triggered deterministically
  // via a one-time navigation param (?showJourneyIntro=1) so nothing else can fire it.
  const [showJourneyIntro, setShowJourneyIntro] = useState(false);
  useEffect(() => {
    if (showJourneyIntroParam === "1") {
      setShowJourneyIntro(true);
      // Deferred to the next tick — calling router.setParams() synchronously on the very first
      // render (e.g. landing here directly from manifest-setup's replace()) can fire before the
      // Root Layout/navigator has finished mounting, throwing "navigate before mounting".
      const t = setTimeout(() => router.setParams({ showJourneyIntro: undefined }), 0);
      return () => clearTimeout(t);
    }
  }, [showJourneyIntroParam]);

  useEffect(() => {
    let timer: any;
    const schedule = () => {
      const ms = nextCosmicUpdateMs();
      timer = setTimeout(() => { setCosmic(getCosmicEnergy()); schedule(); }, ms);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // ============ HOLD-TO-MANIFEST ============
  const holdProgress = useSharedValue(0);
  const symbolPulse = useSharedValue(1);
  const energyGlow = useSharedValue(0);
  // Drives ONLY the deity halo's scale bump, kept independent from `energyGlow` (which now can
  // persist raised after a completed ritual for opacity/brightness). This always returns to 0
  // once a hold ends, so a persisted brightness boost never permanently enlarges the ring.
  const glowScaleBoost = useSharedValue(0);
  const seedScale = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const [showFlash, setShowFlash] = useState(false);
  // Continuous soft glow on the Hold to Manifest button while today's ritual is pending
  const holdGlow = useSharedValue(0.35);

  useEffect(() => {
    if (!ritualDone) {
      holdGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.35, { duration: 1100, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(holdGlow);
      holdGlow.value = 0;
    }
  }, [ritualDone]);

  const finishRitual = async () => {
    if (!active) return;
    // Captured BEFORE the API call updates the manifestation, so we know whether this was
    // the very first ritual (Hold to Start) or a continuing one (Hold to Add Power).
    const wasFirstRitual = (active.streak_count ?? 0) === 0;
    try {
      const local_date = getLocalDateStr(new Date());
      const res = await api<any>(`/manifestations/${active.id}/ritual`, { method: "POST", body: { local_date } });
      setActive(res.manifestation);
      setRitualDone(true);
      // Today's ritual is done — push the local streak-reminder notification to tomorrow
      // evening instead of tonight, so the user doesn't get reminded about something already
      // completed (Section 5E: "if streak done today, don't send a reminder").
      if (user?.streak_reminder_enabled !== false) {
        scheduleStreakReminder(user?.streak_reminder_time ?? "20:00", true).catch(() => {});
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setShowStreakCard(wasFirstRitual ? "start" : "power");
    } catch (e: any) {
      console.warn("Ritual failed", e);
      // Already-performed-today is not a real failure — sync UI state instead of leaving the
      // user stuck on a hold gesture that silently does nothing.
      if (String(e?.message || "").includes("Already performed")) {
        setRitualDone(true);
      }
    }
  };

  const HOLD_DURATION_MS = 4000;

  const runRitualAnim = () => {
    // Only the deity symbol pulses with a divine glow — the card itself never moves.
    // Runs indefinitely (until cancelled in endHold) instead of a fixed repeat count, so it
    // always stays in sync with however long the user actually holds the button.
    symbolPulse.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    energyGlow.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 600, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    glowScaleBoost.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 600, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    seedScale.value = withTiming(1.4, { duration: HOLD_DURATION_MS - 200, easing: Easing.out(Easing.quad) });
  };

  // Fires the flash + ritual-complete sequence — ONLY ever called from the withTiming
  // completion callback below (runOnJS), which Reanimated guarantees fires with
  // finished === true solely when the hold animation reaches 100% naturally. Releasing early
  // calls cancelAnimation() on holdProgress, which makes finished === false and this never runs.
  const completeHoldRitual = () => {
    setHolding(false);
    setShowFlash(true);
    // Power-surge climax — right as the hold completes, briefly push everything well past the
    // hold's own peak intensity (dramatic release of built-up power). The glow's BRIGHTNESS then
    // settles to a raised baseline (not idle) so the intensification visibly persists after the
    // ritual — but its SIZE (symbolPulse, glowScaleBoost) always returns to the exact pre-hold
    // baseline, so the deity circle never ends up permanently larger, only more luminous.
    symbolPulse.value = withSequence(
      withTiming(1.45, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 500 })
    );
    energyGlow.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(0.7, { duration: 500 })
    );
    glowScaleBoost.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 500 })
    );
    seedScale.value = withSequence(
      withTiming(1.9, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 500 })
    );
    flashOpacity.value = withSequence(
      withTiming(0.35, { duration: 100 }),
      withTiming(0, { duration: 600 })
    );
    setTimeout(() => {
      setShowFlash(false);
      finishRitual();
    }, 700);
  };

  const startHold = () => {
    if (!active || ritualDone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHolding(true);
    runRitualAnim();
    // The ritual only completes when this animation finishes naturally (finished === true).
    // An early release cancels it via cancelAnimation() in endHold(), so finished is false and
    // completeHoldRitual() never runs — fixing the bug where releasing early still manifested.
    holdProgress.value = withTiming(
      1,
      { duration: HOLD_DURATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(completeHoldRitual)();
      }
    );
  };
  const endHold = () => {
    if (!holding) return;
    setHolding(false);
    cancelAnimation(holdProgress);
    cancelAnimation(symbolPulse);
    cancelAnimation(energyGlow);
    cancelAnimation(glowScaleBoost);
    cancelAnimation(seedScale);
    symbolPulse.value = withSpring(1, { damping: 10 });
    energyGlow.value = withTiming(0, { duration: 200 });
    glowScaleBoost.value = withTiming(0, { duration: 200 });
    seedScale.value = withTiming(0, { duration: 200 });
    holdProgress.value = withTiming(0, { duration: 200 });
  };

  const deleteManifestation = async () => {
    if (!active) return;
    setBusyState(true);
    try {
      await api(`/manifestations/${active.id}/abandon`, { method: "POST" });
      setActive(null);
      setAffirmation(null);
      setRitualDone(false);
      setShowDeleteConfirm(false);
    } finally { setBusyState(false); }
  };

  const symbolStyle = useAnimatedStyle(() => ({ transform: [{ scale: symbolPulse.value }] }));
  const energyGlowStyle = useAnimatedStyle(() => ({ opacity: energyGlow.value }));
  const seedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: seedScale.value }],
    opacity: interpolate(seedScale.value, [0, 0.5, 1.5], [0, 1, 1]),
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));
  const progressStyle = useAnimatedStyle(() => ({ width: `${holdProgress.value * 100}%` as any }));
  const holdGlowStyle = useAnimatedStyle(() => ({ opacity: holdGlow.value }));

  // Came True hold logic
  const cameTrueProgress = useSharedValue(0);
  const cameTrueStyle = useAnimatedStyle(() => ({ width: `${cameTrueProgress.value * 100}%` as any }));

  // Streak glow — gentle pulsing warmth behind the flame on the redesigned Daily Streak card,
  // always animating while a manifestation is active (independent of ritualDone/holding state).
  const streakGlow = useSharedValue(0.5);
  useEffect(() => {
    if (active) {
      streakGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.5, { duration: 1400, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(streakGlow);
    }
  }, [!!active]);
  const streakGlowStyle = useAnimatedStyle(() => ({ opacity: streakGlow.value }));

  const startCameTrueHold = () => {
    if (!active) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHoldingCameTrue(true);
    cameTrueProgress.value = withTiming(1, { duration: 2500, easing: Easing.linear });
    setTimeout(() => {
      if (cameTrueProgress.value >= 0.98) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowCameTrue(true);
        setHoldingCameTrue(false);
        cameTrueProgress.value = 0;
      }
    }, 2600);
  };
  const endCameTrueHold = () => {
    if (!holdingCameTrue) return;
    setHoldingCameTrue(false);
    cancelAnimation(cameTrueProgress);
    cameTrueProgress.value = 0;
  };

  const isPremium = !!user?.is_premium;
  const affirmationText = affirmation?.text;
  const showAffirmationCard = !!(active?.affirmation_enabled && affirmationText);
  // Deity glow is now ALWAYS on — pre-selection (no manifestation yet) and post-selection
  // (normal day-to-day state) both show the exact same baseline breathing halo via
  // DeityHero's own `glowActive` (defaults true). It only visibly INTENSIFIES on top of that
  // baseline while actively holding "Hold to Start"/"Hold to Add Power" — that's the separate
  // `holdEnergyGlow` overlay driven by `energyGlow`/`runRitualAnim()` below, which stays at
  // opacity 0 until a hold begins. (Previously this was gated on `ritualDone`, so the deity
  // never glowed at all before the day's ritual was completed — that was the bug.)
  const deityGlowActive = true;

  const goalCat = active ? GOAL_CATEGORIES.find((g) => g.key === active.goal_category) : null;
  const sacCat = active ? SACRIFICE_CATEGORIES.find((s) => s.key === active.sacrifice_category) : null;
  const goalLabel = active ? (active.goal_category === "custom" ? (active.goal_custom || "your goal") : (goalCat?.label || "your goal")) : "";
  const sacrificeLabel = active ? (active.sacrifice_category === "custom" ? (active.sacrifice_custom || "your sacrifice") : (sacCat?.label || "your sacrifice")) : "";
  // Same as above but translated into the selected affirmation language when available — used
  // ONLY inside the sacrifice-affirmation sentence ("I am sacrificing X to get Y"), not the
  // Goal/Sacrifice cards elsewhere (which intentionally stay in English, matching every other
  // category label shown across the app). "Custom" goals/sacrifices are the user's own free
  // text and can't be translated, so they always fall back to the English/custom value as-is.
  const goalLabelTranslated = active && active.goal_category !== "custom"
    ? (categoryLabels[active.goal_category] || goalLabel)
    : goalLabel;
  const sacrificeLabelTranslated = active && active.sacrifice_category !== "custom"
    ? (categoryLabels[active.sacrifice_category] || sacrificeLabel)
    : sacrificeLabel;

  const journeyStatus = useMemo(() => {
    if (!active) return null;
    const pct = Math.round((active.current_day / active.cycle_days) * 100);
    if (pct >= 100) return { label: "Cycle complete", color: COLORS.success };
    if (pct >= 66) return { label: "Final stretch", color: COLORS.gold };
    if (pct >= 33) return { label: "In flow", color: COLORS.electric };
    return { label: "Just started", color: COLORS.cyan };
  }, [active]);

  // Short, tiered motivational line shown on the redesigned Daily Streak card — escalates
  // with the streak so returning users always feel their progress is being recognized.
  const streakMessage = useMemo(() => {
    if (!active) return "";
    const s = active.streak_count ?? 0;
    if (s <= 0) return "Start today — your streak begins now";
    if (s === 1) return "Great start! Keep the momentum going";
    if (s < 3) return "Building momentum, one day at a time";
    if (s < 7) return "You're building something real";
    if (s < 14) return "One week strong — you're on fire! 🔥";
    if (s < 30) return "Two weeks of unstoppable discipline";
    return "Extraordinary commitment. Keep going!";
  }, [active?.streak_count]);

  // Connected-circles "week strip" for the Daily Streak card — a 7-slot window of the
  // CURRENT cycle (not raw calendar dates, so it needs no extra API call on Home) showing
  // which of this week's cycle days are completed, which is next/pending, and which are
  // still upcoming. Clamped so short cycles (<7 days) and the tail end of any cycle never
  // render a day number beyond cycle_days.
  const weekStrip = useMemo(() => {
    if (!active) return [];
    const cycleDays = active.cycle_days ?? 21;
    const current = active.current_day ?? 0;
    let windowStart = Math.floor(current / 7) * 7 + 1;
    let windowEnd = windowStart + 6;
    if (windowEnd > cycleDays) {
      windowEnd = cycleDays;
      windowStart = Math.max(1, windowEnd - 6);
    }
    const cells: { day: number; status: "completed" | "next" | "upcoming" }[] = [];
    for (let day = windowStart; day <= windowEnd; day++) {
      cells.push({ day, status: day <= current ? "completed" : day === current + 1 ? "next" : "upcoming" });
    }
    return cells;
  }, [active?.current_day, active?.cycle_days]);

  const onGoalOrSacPress = () => {
    if (active) setShowLocked(true);
    else router.push("/manifest-setup");
  };

  const markNotificationStreakDone = async () => {
    if (!active?.id) return;
    const localDate = getLocalDateStr(new Date());
    const result = await api<any>(`/manifestations/${active.id}/notification-response`, {
      method: "POST",
      body: { event_id: `home-streak-${localDate}`, local_date: localDate, kind: "home" },
    });
    setActive({ ...active, notification_score: result.notification_score, notification_streak: result.notification_streak });
    if (result.recorded) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const moonDetail = useMemo(() => getMoonDetail(spiritual.name), [spiritual.name]);
  const cosmicDetail = useMemo(() => getCosmicMeaning(cosmic), [cosmic]);

  return (
    <View style={styles.container} testID="home-screen">
      <AnimatedBackground deityColor={deity.color} />
      {showFlash && (
        <Animated.View pointerEvents="none" style={[styles.flash, { backgroundColor: deity.color }, flashStyle]} />
      )}
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <SwipeNav screen="home">
        {/* Header scrolls WITH the content (no black bar) — transparent, part of the page. */}
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 220 }} showsVerticalScrollIndicator={false}>
          <View style={styles.headerBar} testID="home-header">
            <AppLogo size={40} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              {!!active && (
                <TouchableOpacity
                  onPress={() => setShowReminderCenter(true)}
                  testID="home-reminder-bell"
                  hitSlop={12}
                  style={styles.settingsBtn}
                >
                  <Ionicons
                    name={active.reminder_count > 0 ? "notifications" : "notifications-off-outline"}
                    size={20}
                    color={active.reminder_count > 0 ? COLORS.gold : COLORS.gray2}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => router.push("/settings")} testID="home-settings" hitSlop={12} style={styles.settingsBtn}>
                <Ionicons name="settings-outline" size={20} color={COLORS.gray1} />
              </TouchableOpacity>
            </View>
          </View>
          {!manifestLoaded ? (
            // Unified top-of-screen skeleton — pixel-matched to the Moon/Cosmic row, Deity
            // Hero card, and Goal/Sacrifice row it precedes, so nothing pops in at a different
            // size once the real content (pre- or post-selection, same card sizes either way)
            // arrives.
            <View testID="home-top-skeleton">
              <View style={styles.row2}>
                <Card wrapperStyle={{ flex: 1 }} style={styles.statCard}>
                  <Skeleton style={{ width: 80, height: 9 }} />
                  <View style={styles.statRow}>
                    <Skeleton style={{ width: 64, height: 15 }} />
                    <Skeleton style={{ width: 44, height: 10 }} />
                  </View>
                  <Skeleton style={{ width: "100%", height: 3, borderRadius: 2 }} />
                  <Skeleton style={{ width: 70, height: 9 }} />
                </Card>
                <Card wrapperStyle={{ flex: 1 }} style={styles.statCard}>
                  <Skeleton style={{ width: 80, height: 9 }} />
                  <View style={styles.statRow}>
                    <Skeleton style={{ width: 40, height: 20 }} />
                    <Skeleton style={{ width: 50, height: 10 }} />
                  </View>
                  <Skeleton style={{ width: "100%", height: 3, borderRadius: 2 }} />
                  <Skeleton style={{ width: 90, height: 9 }} />
                </Card>
              </View>
              <View style={styles.heroWrap}>
                <View style={styles.heroCard}>
                  <View style={styles.heroSymbolWrap}>
                    <Skeleton style={{ width: DEITY_SIZE * 0.55, height: DEITY_SIZE * 0.55, borderRadius: 999 }} />
                  </View>
                  <Skeleton style={{ width: 150, height: 17, marginTop: 12, borderRadius: 4 }} />
                  <Skeleton style={{ width: 110, height: 11, marginTop: 6 }} />
                </View>
              </View>
              {hadActiveHint && (
                // Only shown when the previous session had an active manifestation - covers the
                // Daily Streak + Your Journey cards that render BEFORE the Goal/Sacrifice row in
                // the real post-selection layout, so the skeleton's stacking order matches it.
                <>
                  <View style={[styles.streakCard, { marginBottom: 12, marginTop: 12 }]} testID="streak-skeleton">
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Skeleton style={{ width: 52, height: 52, borderRadius: 999 }} />
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Skeleton style={{ width: 90, height: 24 }} />
                        <Skeleton style={{ width: 140, height: 12, marginTop: 6 }} />
                      </View>
                    </View>
                    <Skeleton style={{ width: "100%", height: 1, marginTop: 12, marginBottom: 10 }} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <Skeleton key={n} style={{ width: 24, height: 24, borderRadius: 999 }} />
                      ))}
                    </View>
                  </View>
                  <View style={styles.journeyCard} testID="journey-skeleton">
                    <Skeleton style={{ width: 110, height: 14 }} />
                    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14 }}>
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <View key={n} style={{ width: "33.33%", paddingVertical: 8 }}>
                          <Skeleton style={{ width: 60, height: 9 }} />
                          <Skeleton style={{ width: 80, height: 13, marginTop: 4 }} />
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              )}
              <View style={styles.gsRow} testID="goal-sacrifice-skeleton">
                <Card style={styles.gsCard}>
                  <View style={styles.gsInner}>
                    <Skeleton style={{ width: 44, height: 44, borderRadius: 999 }} />
                    <Skeleton style={{ width: 60, height: 10, marginTop: 4 }} />
                    <Skeleton style={{ width: 80, height: 13 }} />
                    <Skeleton style={{ width: 11, height: 11, borderRadius: 999, marginTop: 4 }} />
                  </View>
                </Card>
                <Card style={styles.gsCard}>
                  <View style={styles.gsInner}>
                    <Skeleton style={{ width: 44, height: 44, borderRadius: 999 }} />
                    <Skeleton style={{ width: 60, height: 10, marginTop: 4 }} />
                    <Skeleton style={{ width: 80, height: 13 }} />
                    <Skeleton style={{ width: 11, height: 11, borderRadius: 999, marginTop: 4 }} />
                  </View>
                </Card>
              </View>
            </View>
          ) : (
          <>
          {/* Moon + Cosmic — compact (~50% height), essentials only: phase name, date, energy level */}
          <View style={styles.row2}>
            <Card wrapperStyle={{ flex: 1 }} style={styles.statCard} testID="moon-card" onPress={() => setShowMoon(true)}>
              <Text style={styles.miniLabel} numberOfLines={1}>{spiritual.emoji}  MOON PHASE</Text>
              <View style={styles.statRow}>
                <Text style={styles.moonName} numberOfLines={1}>{spiritual.name}</Text>
                <Text style={styles.miniSub} numberOfLines={1}>{moon.label}</Text>
              </View>
              <View style={styles.miniBar}>
                <View style={[styles.miniFill, { width: `${(spiritual.dayNumber / spiritual.total) * 100}%`, backgroundColor: COLORS.gold }]} />
              </View>
              <Text style={styles.dayTag} numberOfLines={1}>{todayStr}</Text>
            </Card>
            <Card wrapperStyle={{ flex: 1 }} style={styles.statCard} testID="cosmic-energy-card" onPress={() => setShowCosmic(true)}>
              <Text style={styles.miniLabel} numberOfLines={1}>✦  COSMIC ENERGY</Text>
              <View style={styles.statRow}>
                <Text style={styles.cosmicNum}>{cosmic}%</Text>
                <Text style={styles.miniSub} numberOfLines={1}>{cosmicDetail.label}</Text>
              </View>
              <View style={styles.miniBar}>
                <View style={[styles.miniFill, { width: `${cosmic}%`, backgroundColor: cosmic > 60 ? COLORS.gold : COLORS.electric }]} />
              </View>
              <Text style={styles.dayTag} numberOfLines={1}>Refreshes every 5 min</Text>
            </Card>
          </View>

          {/* Deity Hero — card itself stays still; only the symbol/glow inside animates during ritual */}
          <View style={styles.heroWrap}>
            <View style={styles.heroCard} testID="deity-hero">
              <LinearGradient colors={[deity.color + "10", "transparent"]} style={StyleSheet.absoluteFillObject} />
              <View style={styles.heroSymbolWrap}>
                <Animated.View pointerEvents="none" style={[styles.holdEnergyGlow, { backgroundColor: deity.color + "33", shadowColor: deity.color }, energyGlowStyle]} />
                <Animated.View style={[styles.heroSymbol, symbolStyle]}>
                  <DeityHero deityName={deity.name} color={deity.color} glow={deity.glow} size={DEITY_SIZE} glowActive={deityGlowActive} boost={energyGlow} boostScale={glowScaleBoost} />
                </Animated.View>
                <Animated.View style={[styles.seed, { backgroundColor: deity.color, shadowColor: deity.color }, seedStyle]} />
              </View>
              <Text style={[styles.deityLabel, { color: deity.color }]}>
                {deity.name.toUpperCase().split("").join(" ")}
              </Text>
              <Text style={styles.deitySub}>Your guiding force</Text>
            </View>
          </View>
          </>
          )}

          {/* §5 order: streak cards FIRST (notification + daily grouped), affirmation below. */}
          {active && manifestLoaded && (
            <View style={{ marginTop: 12, marginBottom: 12 }}>
              <NotificationStreakCard
                score={active.notification_score || 0}
                target={(active.cycle_days || 0) * (active.reminder_count || 0)}
                notificationStreak={active.notification_streak || 0}
                dailyStreak={active.streak_count || 0}
                maxDailyStreak={active.max_streak || 0}
                onDailyPress={() => setShowStreakDetail(true)}
              />
            </View>
          )}

          {active && manifestLoaded && (
            <View style={{ marginBottom: 12 }}>
              <SacredCommitmentCard
                testID="home-sacred-commitment"
                burningDesire={active.burning_desire || active.goal_description}
                affirmation={affirmationText}
                sacrifice={fillSacrificeTemplate(uiStrings.sacrifice_template, sacrificeLabelTranslated, goalLabelTranslated)}
              />
            </View>
          )}

          {/* Your Journey — details grid (streak bar detached above) */}
          {active && (
            <TouchableOpacity testID="journey-details" activeOpacity={0.9} onPress={() => setShowJourney(true)}>
              <Card style={styles.journeyCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.sectionLabel}>YOUR JOURNEY</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
                </View>
                <View style={styles.jGrid}>
                  <JCell label="DURATION" value={`${active.cycle_days} days`} />
                  <JCell label="DEITY" value={deity.name} color={deity.color} />
                  <JCell label="REMINDERS" value={active.reminder_count ? `${active.reminder_count}x/day` : "Off"} />
                  <JCell label="AFFIRMATION" value={active.affirmation_enabled ? "On" : "Off"} />
                  <JCell label="FASTING" value={active.fasting_enabled ? "Yes ✓" : "No"} color={active.fasting_enabled ? COLORS.success : undefined} />
                  <JCell label="HUSTLE" value={active.hustle_enabled ? "Linked ✓" : "No"} color={active.hustle_enabled ? COLORS.success : undefined} />
                  <JCell label="STATUS" value={ritualDone ? "Today done ✓" : "Pending"} color={ritualDone ? COLORS.success : COLORS.warning} />
                </View>
              </Card>
            </TouchableOpacity>
          )}

          {/* Goal + Sacrifice — real content only now; while the active-manifestation fetch is
              still in flight, the unified top skeleton above (which also covers this row's
              exact size) is shown instead of this block entirely. */}
          {!active && <View style={styles.gsRow}>
            <TouchableOpacity testID="goal-orb" activeOpacity={0.85} onPress={onGoalOrSacPress} style={{ flex: 1 }}>
              <Card style={[styles.gsCard, active && { borderWidth: 1, borderColor: COLORS.warning + "40" }]}>
                {active ? (
                  <View style={styles.gsInner}>
                    <View style={[styles.gsIcon, { backgroundColor: COLORS.warning + "20" }]}>
                      <Text style={styles.gsEmoji}>{goalCat?.emoji || "🎯"}</Text>
                    </View>
                    <Text style={styles.gsLabel}>GOAL</Text>
                    <Text style={styles.gsValue} numberOfLines={1}>
                      {active.goal_category === "custom" ? (active.goal_custom || "Custom") : (goalCat?.label || "Set")}
                    </Text>
                    <Ionicons name="lock-closed" size={11} color={COLORS.gray2} style={{ marginTop: 4 }} />
                  </View>
                ) : (
                  <View style={styles.gsEmpty}>
                    <View style={styles.plusCircle}>
                      <Ionicons name="add" size={30} color={COLORS.gray1} />
                    </View>
                    <Text style={styles.gsSetLabel}>SET GOAL</Text>
                  </View>
                )}
              </Card>
            </TouchableOpacity>
            <TouchableOpacity testID="sacrifice-orb" activeOpacity={0.85} onPress={onGoalOrSacPress} style={{ flex: 1 }}>
              <Card style={[styles.gsCard, active && { borderWidth: 1, borderColor: COLORS.cyan + "40" }]}>
                {active ? (
                  <View style={styles.gsInner}>
                    <View style={[styles.gsIcon, { backgroundColor: COLORS.cyan + "20" }]}>
                      <Text style={styles.gsEmoji}>{sacCat?.emoji || "🔥"}</Text>
                    </View>
                    <Text style={styles.gsLabel}>SACRIFICE</Text>
                    <Text style={styles.gsValue} numberOfLines={1}>
                      {active.sacrifice_category === "custom" ? (active.sacrifice_custom || "Custom") : (sacCat?.label || "Set")}
                    </Text>
                    <Ionicons name="lock-closed" size={11} color={COLORS.gray2} style={{ marginTop: 4 }} />
                  </View>
                ) : (
                  <View style={styles.gsEmpty}>
                    <View style={styles.plusCircle}>
                      <Ionicons name="add" size={30} color={COLORS.gray1} />
                    </View>
                    <Text style={styles.gsSetLabel}>SET SACRIFICE</Text>
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          </View>}

          {/* Hustle + Fasting cards (only when enabled) — same grid dimensions as Goal/Sacrifice */}
          {active && (active.hustle_enabled || active.fasting_enabled) && (
            <View style={[styles.gsRow, { marginTop: 10 }]}>
              {active.hustle_enabled && (
                <TouchableOpacity testID="hustle-card" activeOpacity={0.85} onPress={() => setShowHustle(true)} style={{ flex: 1 }}>
                  <Card style={[styles.gsCard, { borderWidth: 1, borderColor: COLORS.gold + "40" }]}>
                    <View style={styles.gsInner}>
                      <View style={[styles.gsIcon, { backgroundColor: COLORS.gold + "20" }]}>
                        <Text style={styles.gsEmoji}>💪</Text>
                      </View>
                      <Text style={styles.gsLabel}>HUSTLE</Text>
                      <Text style={styles.gsValue} numberOfLines={1}>Linked</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              )}
              {active.fasting_enabled && (
                <TouchableOpacity testID="fasting-card" activeOpacity={0.85} onPress={() => setShowFasting(true)} style={{ flex: 1 }}>
                  <Card style={[styles.gsCard, { borderWidth: 1, borderColor: COLORS.electric + "40" }]}>
                    <View style={styles.gsInner}>
                      <View style={[styles.gsIcon, { backgroundColor: COLORS.electric + "20" }]}>
                        <Text style={styles.gsEmoji}>🍽️</Text>
                      </View>
                      <Text style={styles.gsLabel}>FASTING</Text>
                      <Text style={styles.gsValue} numberOfLines={1}>Linked</Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Notes */}
          {active?.goal_description ? (
            <Card style={{ marginTop: 12 }} testID="notes-card">
              <Text style={styles.sectionLabel}>📝 NOTES</Text>
              <Text style={{ color: COLORS.gray1, fontSize: 13, marginTop: 6 }} numberOfLines={4}>
                {active.goal_description}
              </Text>
            </Card>
          ) : null}

          {/* Delete Manifestation — moved to the very bottom, separated from the main journey to prevent accidental taps */}
          {active && (
            <TouchableOpacity
              testID="delete-manifestation"
              activeOpacity={0.85}
              onPress={() => setShowDeleteConfirm(true)}
              style={[styles.deleteBtn, { marginTop: 20, marginBottom: 0 }]}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
              <Text style={styles.deleteText}>Delete Manifestation</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        </SwipeNav>

        {/* Sticky action bar */}
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 80 }]} pointerEvents="box-none">
          <LinearGradient colors={["transparent", COLORS.void + "F0", COLORS.void]} style={styles.stickyGradient} pointerEvents="none" />
          {!manifestLoaded ? (
            <View style={[styles.beginBtn, { backgroundColor: COLORS.surface1, alignItems: "center", justifyContent: "center" }]} testID="sticky-bar-skeleton">
              <Skeleton style={{ width: "70%", height: 16 }} />
            </View>
          ) : !active ? (
            <TouchableOpacity testID="begin-manifestation" onPress={() => router.push("/manifest-setup")} activeOpacity={0.9} style={styles.beginBtn}>
              <LinearGradient colors={[COLORS.gold, "#FFE082"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
              <Text style={styles.beginText} numberOfLines={1}>🌱  Begin New Manifestation</Text>
            </TouchableOpacity>
          ) : ritualDone ? (
            <View style={styles.actionsRow}>
              <View style={[styles.actionBtn, styles.doneBtn]}>
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: COLORS.surface1 }]} />
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: COLORS.success + "20" }]} />
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={[styles.actionText, { color: COLORS.success }]}>Ritual Complete</Text>
              </View>
              <TouchableOpacity
                testID="manifested-btn"
                onPressIn={startCameTrueHold}
                onPressOut={endCameTrueHold}
                style={[styles.actionBtn, styles.manifestedBtn]}
                activeOpacity={0.85}
              >
                <Text style={[styles.actionText, { color: COLORS.void }]}>
                  {holdingCameTrue ? "HOLD..." : "✦ Came True"}
                </Text>
                <Animated.View style={[styles.holdProgress, { backgroundColor: COLORS.void, opacity: 0.35 }, cameTrueStyle]} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionsRow}>
              <TouchableOpacity testID="manifest-hold" activeOpacity={0.85} onPressIn={startHold} onPressOut={endHold} style={[styles.actionBtn, styles.holdBtn]}>
                <LinearGradient colors={["#161650", COLORS.surface1]} style={StyleSheet.absoluteFillObject} />
                <Text style={[styles.actionText, { letterSpacing: 1.5 }]} numberOfLines={1} adjustsFontSizeToFit>
                  {(active?.streak_count ?? 0) > 0 ? "HOLD TO ADD POWER" : "HOLD TO START"}
                </Text>
                <Animated.View style={[styles.holdProgress, { backgroundColor: deity.color }, progressStyle]} />
                <Animated.View pointerEvents="none" style={[styles.holdBtnGlow, { borderColor: deity.color, shadowColor: deity.color }, holdGlowStyle]} />
              </TouchableOpacity>
              <TouchableOpacity
                testID="manifested-btn"
                disabled
                style={[styles.actionBtn, styles.manifestedBtn, styles.manifestedBtnDisabled]}
                activeOpacity={1}
              >
                <Text style={[styles.actionText, { color: COLORS.gray2 }]}>✦ Came True</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* Affirmation full-screen modal */}
      <Modal transparent visible={showAffirmation} animationType="fade" onRequestClose={() => setShowAffirmation(false)}>
        <Pressable style={styles.centerBackdrop} onPress={() => setShowAffirmation(false)}>
          <Pressable style={styles.centerCard} onPress={(e) => e.stopPropagation()} testID="ritual-success-card">
            <LinearGradient colors={[deity.color + "22", COLORS.surface1]} style={StyleSheet.absoluteFillObject} />
            <TouchableOpacity testID="affirmation-close" onPress={() => setShowAffirmation(false)} style={styles.centerClose} hitSlop={16}>
              <Ionicons name="close" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <DeityStone deityName={deity.name} color={deity.color} glow={deity.glow} size={72} glowIntensity={1.2} />
            </View>
            {!!active && (
              <SacredCommitmentCard
                testID="ritual-success-sacred-commitment"
                compact
                burningDesire={active.burning_desire || active.goal_description}
                affirmation={affirmationText}
                sacrifice={fillSacrificeTemplate(uiStrings.sacrifice_template, sacrificeLabelTranslated, goalLabelTranslated)}
              />
            )}
            {ritualDone && (
              <Text style={styles.returnTomorrow} testID="ritual-success-return-tomorrow">
                {uiStrings.return_tomorrow}
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Moon detail */}
      <InfoModal
        testID="moon-modal"
        visible={showMoon}
        onClose={() => setShowMoon(false)}
        title={spiritual.name}
        subtitle={`${spiritual.desc}  ·  Day ${spiritual.dayNumber} of ${spiritual.total}`}
        accent={COLORS.gold}
        icon={<Text style={{ fontSize: 40 }}>{spiritual.emoji}</Text>}
        sections={[
          { label: "TODAY", body: todayStr },
          { label: "SPIRITUAL MEANING", body: moonDetail.meaning },
          { label: "INFLUENCE ON MANIFESTATION", body: moonDetail.manifestation },
          { label: "RECOMMENDED PRACTICE", body: moonDetail.practice },
          { label: "ASTRONOMICAL PHASE", body: `${moon.emoji} ${moon.label}` },
        ]}
      />

      {/* Streak detail — rich, graphical sheet (stats, milestone progress, real completed/
          missed calendar, icon tips) about the streak system itself. Decoupled from the
          generic "Your Journey" modal further below. */}
      <StreakDetailModal
        visible={showStreakDetail}
        onClose={() => setShowStreakDetail(false)}
        manifestation={active}
        deityColor={deity.color}
      />


      {/* Cosmic detail */}
      <InfoModal
        testID="cosmic-modal"
        visible={showCosmic}
        onClose={() => setShowCosmic(false)}
        title={`${cosmic}%`}
        subtitle={cosmicDetail.label}
        accent={cosmic > 60 ? COLORS.gold : COLORS.electric}
        icon={<Text style={{ fontSize: 40 }}>{cosmic > 70 ? "⚡" : cosmic > 40 ? "✨" : "🌌"}</Text>}
        sections={[
          { label: "WHAT THIS LEVEL MEANS", body: cosmicDetail.meaning },
          { label: "YOUR STREAK", body: active
              ? `Your ${active.streak_count}-day streak amplifies your ritual. Consistency is the true multiplier — the level fluctuates, but your discipline compounds.`
              : "Begin a manifestation to start compounding. Every ritual amplifies the cosmic signal." },
          { label: "BENEFITS OF HIGHER LEVELS", body: "Above 65%, actions are lighter, coincidences multiply, and rituals feel more potent. Peak (85%+) is the ideal window for bold requests." },
          { label: "HOW TO RAISE IT", body: "Show up daily. Hold the manifest ritual. Fast if you committed to it. Every day of consistency thickens the current — even when today's number reads low." },
        ]}
      />

      {/* Journey detail */}
      <InfoModal
        testID="journey-modal"
        visible={showJourney}
        onClose={() => setShowJourney(false)}
        title="Your Journey"
        subtitle={active ? `Day ${active.current_day} of ${active.cycle_days}` : ""}
        accent={deity.color}
        hero={active ? (
          <View style={{ alignItems: "center" }}>
            <DeityStone deityName={deity.name} color={deity.color} glow={deity.glow} size={80} glowIntensity={1.2} />
          </View>
        ) : null}
        sections={active ? [
          { label: "BURNING DESIRE", body: active.burning_desire || active.goal_description || "Private intention" },
          { label: "AFFIRMATION", body: affirmationText || "Personalized affirmation" },
          { label: "SACRIFICE", body: fillSacrificeTemplate(uiStrings.sacrifice_template, sacrificeLabelTranslated, goalLabelTranslated) },
          { label: "GOAL", body: active.goal_category === "custom" ? (active.goal_custom || "Personal Goal") : `${goalCat?.emoji} ${goalCat?.label}` },
          { label: "DEITY", body: deity.name },
          { label: "DURATION", body: `${active.cycle_days} days` },
          { label: "REMINDERS", body: active.reminder_count ? `${active.reminder_count}x per day${user?.notification_busy_start ? ` · Busy ${user?.notification_busy_start} → ${user?.notification_busy_end}` : ""}` : "Off" },
          { label: "FASTING", body: active.fasting_enabled ? "Yes ✓" : "No" },
          { label: "HUSTLE LINKED", body: active.hustle_enabled ? "Yes ✓" : "No" },
          { label: "PROGRESS", body: `${Math.round((active.current_day / active.cycle_days) * 100)}% complete · Streak 🔥 ${active.streak_count} (max ${active.max_streak})` },
          { label: "STATUS", body: active.status === "manifested" ? "✅ Manifested" : `🌱 ${journeyStatus?.label ?? "Active"}` },
          { label: "CREATED", body: active.created_at ? new Date(active.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "-" },
          ...(active.manifested_at ? [{ label: "COMPLETED", body: new Date(active.manifested_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) }] : []),
        ] : []}
      />

      {/* Hustle info */}
      <InfoModal
        testID="hustle-modal"
        visible={showHustle}
        onClose={() => setShowHustle(false)}
        title="Hustle Linked"
        subtitle="Every effort becomes an offering"
        accent={COLORS.gold}
        icon={<Text style={{ fontSize: 40 }}>💪</Text>}
        sections={[
          { label: "WHAT IT MEANS", body: "Hustle Linking means consciously connecting your daily efforts, work, habits, and activities with your manifestation. It's a mindset — turning everyday action into intentional progress." },
          { label: "HOW IT WORKS", body: "Whenever you perform meaningful actions, mentally dedicate those efforts toward achieving your goal. The task itself does not need to change — only your inner intention behind it." },
          { label: "WHY IT MATTERS", body: "Linking your hustle creates consistency, purpose, and focus throughout your manifestation journey. Small actions compound when they carry meaning." },
          { label: "PRACTICE", body: "Before starting any focused activity, pause for one breath. Silently say: 'This is for my intention.' Then begin. That is enough." },
        ]}
      />

      {/* Fasting info */}
      <InfoModal
        testID="fasting-modal"
        visible={showFasting}
        onClose={() => setShowFasting(false)}
        title="Fasting Linked"
        subtitle="A commitment made in support of your goal"
        accent={COLORS.electric}
        icon={<Text style={{ fontSize: 40 }}>🍽️</Text>}
        sections={[
          { label: "WHAT IT MEANS", body: "During your manifestation journey, fasting represents a conscious spiritual commitment made in support of your goal." },
          { label: "HOW IT WORKS", body: "Each fasting period — however you define it — serves as a physical reminder of your intention, discipline, and dedication toward the manifestation." },
          { label: "WHY IT MATTERS", body: "Fasting is honor-based. It is not about restriction but about deliberate offering. What you set aside creates space for what you invite in." },
          { label: "PRACTICE", body: "Whenever hunger, craving, or urge arises during a fasting window, use it as a cue: gently recall your goal, breathe once, and let the moment strengthen your resolve." },
        ]}
      />

      {/* Came True confirmation → navigate to success flow */}
      <Modal transparent visible={showCameTrue} animationType="fade" onRequestClose={() => setShowCameTrue(false)}>
        <View style={styles.centerBackdrop}>
          <View style={styles.ritualCard} testID="cametrue-confirm-card">
            <LinearGradient colors={[COLORS.gold + "26", COLORS.surface1, COLORS.surface1]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.ritualIcon}>
              <Ionicons name="sparkles" size={56} color={COLORS.gold} />
            </View>
            <Text style={styles.ritualTitle}>It Came True?</Text>
            <Text style={styles.ritualSub}>
              {active
                ? `You are about to seal "${active.goal_category === "custom" ? (active.goal_custom || "your goal") : (goalCat?.label || "your goal")}" as manifested. You'll be guided through a moment of giving back, and given the chance to share your story.`
                : "You are about to seal this manifestation. You will be guided through a moment of giving back, and given the chance to share your story."}
            </Text>
            <FilledButton
              testID="cametrue-continue"
              label={confirmingCameTrue ? "Sealing..." : "Continue ✦"}
              disabled={confirmingCameTrue}
              onPress={() => {
                if (confirmingCameTrue) return;
                setConfirmingCameTrue(true);
                setShowCameTrue(false);
                router.push({ pathname: "/success", params: { id: active?.id } });
                // Reset shortly after navigating away so the modal's button state is clean
                // if the user ever returns to Home and re-triggers the Came True hold again.
                setTimeout(() => setConfirmingCameTrue(false), 800);
              }}
              style={{ marginTop: 24, alignSelf: "stretch" }}
            />
            <TouchableOpacity onPress={() => setShowCameTrue(false)} style={{ marginTop: 10, alignSelf: "stretch", alignItems: "center", padding: 10 }}>
              <Text style={{ color: COLORS.gray1, fontSize: 14, fontWeight: "600" }}>Not yet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Post-ritual success card — the "Hold to Start"/"Hold to Add Power" completion card.
          Mirrors the notification card's content (affirmation + chant instructions + bold
          sacrifice chant) so the ritual experience feels consistent whether triggered by hand
          or by a reminder notification, plus a bold reminder to return tomorrow. */}
      <Modal transparent visible={!!showStreakCard} animationType="fade" onRequestClose={() => setShowStreakCard(null)}>
        <View style={styles.centerBackdrop}>
          <View style={styles.ritualCard} testID="streak-success-card">
            <LinearGradient colors={[deity.color + "26", COLORS.surface1, COLORS.surface1]} style={StyleSheet.absoluteFillObject} />
            <View style={styles.ritualIcon}>
              <Ionicons name={showStreakCard === "start" ? "leaf" : "flash"} size={56} color={deity.color} />
            </View>
            <Text style={styles.ritualTitle}>{showStreakCard === "start" ? "Streak Counted \u2726" : "Power Added \u26a1"}</Text>
            {!!active && (
              <SacredCommitmentCard
                testID="streak-success-sacred-commitment"
                compact
                burningDesire={active.burning_desire || active.goal_description}
                affirmation={affirmationText}
                sacrifice={fillSacrificeTemplate(uiStrings.sacrifice_template, sacrificeLabelTranslated, goalLabelTranslated)}
              />
            )}
            <Text style={styles.returnTomorrow} testID="streak-success-return-tomorrow">
              {uiStrings.return_tomorrow}
            </Text>
            <FilledButton
              testID="streak-success-continue"
              label="Continue ✦"
              onPress={() => setShowStreakCard(null)}
              style={{ marginTop: 24, alignSelf: "stretch" }}
            />
          </View>
        </View>
      </Modal>

      {/* Journey guidance overlay — shown every time a new manifestation journey starts */}
      <JourneyIntroOverlay
        visible={showJourneyIntro}
        onDone={() => setShowJourneyIntro(false)}
      />

      {/* Locked goal/sacrifice notice */}
      <Modal transparent visible={showLocked} animationType="fade" onRequestClose={() => setShowLocked(false)}>
        <Pressable style={styles.centerBackdrop} onPress={() => setShowLocked(false)}>
          <Pressable style={styles.smallCard} onPress={(e) => e.stopPropagation()} testID="locked-card">
            <Ionicons name="lock-closed" size={38} color={COLORS.gold} />
            <Text style={styles.smallTitle}>Locked</Text>
            <Text style={styles.smallDesc}>
              Your Goal and Sacrifice are sealed for this cycle. Delete the current manifestation to begin fresh.
            </Text>
            <FilledButton
              testID="locked-close"
              label="Got it"
              onPress={() => setShowLocked(false)}
              style={{ marginTop: 16, alignSelf: "stretch" }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete confirmation */}
      <Modal transparent visible={showDeleteConfirm} animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable style={styles.centerBackdrop} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.smallCard} onPress={(e) => e.stopPropagation()} testID="delete-confirm-card">
            <View style={[styles.warnIcon, { backgroundColor: COLORS.danger + "22" }]}>
              <Ionicons name="trash" size={30} color={COLORS.danger} />
            </View>
            <Text style={styles.smallTitle}>Delete this manifestation?</Text>
            <Text style={styles.smallDesc}>
              {"Your progress and streak will be reset. You will be free to set a new Goal and Sacrifice."}
            </Text>
            <TouchableOpacity
              testID="delete-confirm"
              onPress={deleteManifestation}
              disabled={busy}
              style={styles.confirmDeleteBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmDeleteText}>{busy ? "Deleting..." : "Yes, delete it"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={{ marginTop: 10, alignSelf: "stretch", alignItems: "center", padding: 10 }} testID="delete-cancel">
              <Text style={{ color: COLORS.gray1, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {active && (
        <ReminderCenter
          visible={showReminderCenter}
          onClose={() => setShowReminderCenter(false)}
          manifestationId={active.id}
          initialCount={active.reminder_count ?? 0}
          initialBusyStart={user?.notification_busy_start}
          initialBusyEnd={user?.notification_busy_end}
          initialBusyHoursEnabled={user?.busy_hours_enabled ?? false}
          initialMode={active.reminder_mode ?? user?.reminder_mode}
          initialTimes={active.reminder_times ?? user?.reminder_times}
          initialWakeEnabled={user?.wake_alarm_enabled}
          initialWakeTime={user?.wake_alarm_time}
          initialSleepEnabled={user?.sleep_alarm_enabled}
          initialSleepTime={user?.sleep_alarm_time}
          onSaved={() => { load(); refresh(); }}
        />
      )}

      {/* Double-back-to-exit — Home is a top-level tab with nowhere to navigate back to. */}
      <Animated.View pointerEvents="none" testID="home-exit-toast" style={[styles.exitToast, exitToastStyle]}>
        <Text style={styles.exitToastText}>Press back again to exit</Text>
      </Animated.View>
    </View>
  );
}

function JCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.jCell}>
      <Text style={styles.jLabel}>{label}</Text>
      <Text style={[styles.jValue, color && { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flash: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  hello: { color: COLORS.white, fontSize: 22, fontWeight: "800" },
  today: { color: COLORS.gray1, fontSize: 12, marginTop: 4 },
  topRowLegacy: { display: "none" },

  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  headerBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 14, paddingTop: 2,
  },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: COLORS.surface1 + "CC",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },

  row2: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: { flex: 1, paddingHorizontal: 14, paddingVertical: 8, height: 66, justifyContent: "space-between" },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  miniLabel: { color: COLORS.gray2, fontSize: 9, fontWeight: "700", letterSpacing: 1.2 },
  moonName: { color: COLORS.white, fontSize: 15, fontWeight: "800", fontStyle: "italic", flexShrink: 1 },
  cosmicNum: { color: COLORS.gold, fontSize: 20, fontWeight: "900" },
  miniSub: { color: COLORS.gray1, fontSize: 10, marginLeft: 6, flexShrink: 1, textAlign: "right" },
  miniBar: { height: 3, backgroundColor: COLORS.gray3, borderRadius: 2, overflow: "hidden" },
  miniFill: { height: "100%" },
  dayTag: { color: COLORS.gray2, fontSize: 9 },

  heroWrap: { marginBottom: 10 },
  heroCard: {
    borderRadius: 28, backgroundColor: COLORS.surface1,
    paddingVertical: 18, alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  heroSymbolWrap: { width: DEITY_SIZE, height: DEITY_SIZE, alignItems: "center", justifyContent: "center" },
  heroSymbol: { alignItems: "center", justifyContent: "center" },
  holdEnergyGlow: {
    position: "absolute", width: 166, height: 166, borderRadius: 999,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 40, shadowOpacity: 1,
  },
  // No `elevation` on purpose — Android's native elevation shadow ignores the deity card's
  // `overflow:"hidden"` clip, letting this tiny seed glow visibly bleed outside the card
  // during/after a hold. shadowRadius/shadowOpacity alone still render it on iOS/Web, clipped.
  seed: {
    position: "absolute", width: 16, height: 16, borderRadius: 999,
    shadowOpacity: 1, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
  },
  deityLabel: { fontSize: 19, fontWeight: "300", letterSpacing: 5, fontStyle: "italic", marginTop: 12 },
  deitySub: { color: COLORS.gray2, fontSize: 11, letterSpacing: 2, marginTop: 4, textTransform: "uppercase" },

  affirmationBig: { padding: 20, overflow: "hidden", borderRadius: 20 },
  affirmHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  affirmHeadLabel: { color: COLORS.gold, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  affirmBigText: { color: COLORS.white, fontSize: 17, fontStyle: "italic", lineHeight: 26, fontWeight: "500" },
  langPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: COLORS.surface2 },
  langText: { color: COLORS.gray1, fontSize: 10, fontWeight: "700" },

  gsRow: { flexDirection: "row", gap: 10 },
  gsCard: { padding: 14, minHeight: 130 },
  gsInner: { alignItems: "center", justifyContent: "center", gap: 6 },
  gsEmpty: { alignItems: "center", justifyContent: "center", gap: 10, minHeight: 100 },
  gsIcon: { width: 44, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  gsEmoji: { fontSize: 22, textAlign: "center", lineHeight: 26 },
  plusCircle: {
    width: 48, height: 48, borderRadius: 999,
    borderWidth: 1.5, borderColor: COLORS.gray3, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface2,
  },
  gsLabel: { color: COLORS.gray2, fontSize: 10, fontWeight: "700", letterSpacing: 2, textAlign: "center" },
  gsSetLabel: { color: COLORS.gray1, fontSize: 12, fontWeight: "700", letterSpacing: 2, textAlign: "center" },
  gsValue: { color: COLORS.white, fontSize: 14, fontWeight: "700", marginTop: 2, textAlign: "center" },

  journeyCard: { marginBottom: 12, padding: 18 },
  streakBarCard: { marginTop: 0, padding: 18 },
  streakCard: { marginTop: 0, padding: 16, overflow: "hidden", borderWidth: 1, borderColor: COLORS.gold + "25" },
  streakTopRow: { flexDirection: "row", alignItems: "center" },
  streakFlameWrap: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  streakFlameGlow: {
    position: "absolute", width: 52, height: 52, borderRadius: 999,
    backgroundColor: COLORS.gold + "35",
    shadowColor: COLORS.gold, shadowOpacity: 1, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
  },
  streakFlameEmoji: { fontSize: 32 },
  streakBigNum: { color: COLORS.white, fontSize: 30, fontWeight: "900" },
  streakUnit: { color: COLORS.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  streakMsg: { color: COLORS.gray1, fontSize: 12.5, marginTop: 2, fontStyle: "italic" },
  streakDivider: { height: 1, backgroundColor: COLORS.gray3, marginTop: 12, marginBottom: 10 },

  weekStripRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stripCircle: {
    width: 30, height: 30, borderRadius: 999, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  stripConnector: { flex: 1, height: 2, backgroundColor: COLORS.gray3, marginHorizontal: 2 },
  stripConnectorActive: { backgroundColor: COLORS.gold },
  stripNextDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: COLORS.gold },
  stripUpcomingNum: { color: COLORS.gray2, fontSize: 10, fontWeight: "700" },

  exitToast: { position: "absolute", bottom: 110, left: 24, right: 24, alignItems: "center" },
  exitToastText: {
    backgroundColor: "#000000CC", color: COLORS.white, fontSize: 13, fontWeight: "600",
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, overflow: "hidden",
  },
  sectionLabel: { color: COLORS.gray2, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  journeyProgress: { marginTop: 10 },
  journeyBar: { height: 6, backgroundColor: COLORS.gray3, borderRadius: 3, overflow: "hidden" },
  journeyFill: { height: "100%" },
  journeyMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  journeyPct: { color: COLORS.white, fontSize: 13, fontWeight: "700" },
  journeyStatusText: { color: COLORS.gold, fontSize: 12, fontWeight: "700" },
  jGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, marginHorizontal: -6 },
  jCell: { width: "33.33%", paddingHorizontal: 6, paddingVertical: 8 },
  jLabel: { color: COLORS.gray2, fontSize: 9, letterSpacing: 1.5, fontWeight: "700" },
  jValue: { color: COLORS.white, fontSize: 13, fontWeight: "700", marginTop: 3 },

  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 0, marginBottom: 12, height: 48, borderRadius: 16,
    backgroundColor: COLORS.danger + "14",
    borderWidth: 1, borderColor: COLORS.danger + "40",
  },
  deleteText: { color: COLORS.danger, fontSize: 14, fontWeight: "700" },

  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 24, zIndex: 20 },
  stickyGradient: { position: "absolute", left: 0, right: 0, top: 0, height: "100%" },
  beginBtn: {
    height: 60, borderRadius: 18, overflow: "hidden",
    alignItems: "center", justifyContent: "center",
    shadowColor: COLORS.gold, shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  beginText: { color: COLORS.void, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  holdBtn: {
    backgroundColor: COLORS.surface1,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  holdBtnGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18, borderWidth: 2, backgroundColor: "transparent",
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 20, shadowOpacity: 1,
  },
  doneBtn: {
    flexDirection: "row", gap: 8,
    borderWidth: 1, borderColor: COLORS.success + "40",
  },
  manifestedBtn: {
    backgroundColor: COLORS.gold,
    shadowColor: COLORS.gold, shadowOpacity: 0.55, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  manifestedBtnDisabled: {
    backgroundColor: COLORS.surface2,
    shadowOpacity: 0, elevation: 0,
  },
  actionText: { color: COLORS.white, fontSize: 13, fontWeight: "800" },
  holdProgress: { position: "absolute", left: 0, bottom: 0, height: 3, opacity: 0.9 },

  centerBackdrop: {
    flex: 1, backgroundColor: "#000000E8",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  centerCard: {
    width: "100%", borderRadius: 28, backgroundColor: COLORS.surface1,
    padding: 28, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 8 }, elevation: 20,
  },
  centerClose: { position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: 999, backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center", zIndex: 5 },
  affirmLabel: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, textAlign: "center" },
  affirmModalBig: { color: COLORS.white, fontSize: 24, fontWeight: "800", fontStyle: "italic", textAlign: "center", marginTop: 16, lineHeight: 32 },
  chantCountModal: { color: COLORS.gold, fontSize: 12.5, fontWeight: "800", textAlign: "center", marginTop: 12, letterSpacing: 0.3 },
  sacrificeChantBoxModal: { marginTop: 18, backgroundColor: "#00000030", borderRadius: 16, padding: 16 },
  sacrificeChantBoldModal: { color: COLORS.white, fontSize: 15, fontWeight: "800", textAlign: "center", lineHeight: 21 },
  affirmSupportive: { color: COLORS.gray2, fontSize: 12.5, textAlign: "center", marginTop: 10, lineHeight: 18 },
  returnTomorrow: { color: COLORS.gold, fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 16, lineHeight: 19 },

  ritualCard: {
    width: "100%", borderRadius: 28, backgroundColor: COLORS.surface1,
    paddingVertical: 32, paddingHorizontal: 28,
    alignItems: "center", overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.7, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: 24,
    borderWidth: 1, borderColor: COLORS.gold + "30",
  },
  ritualIcon: { marginBottom: 8 },
  ritualTitle: { color: COLORS.white, fontSize: 24, fontWeight: "900", marginTop: 8, textAlign: "center" },
  ritualSub: { color: COLORS.gray1, fontSize: 14, textAlign: "center", marginTop: 12, lineHeight: 22 },

  smallCard: {
    width: "100%", borderRadius: 24, backgroundColor: COLORS.surface1,
    padding: 24, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 18,
  },
  smallTitle: { color: COLORS.white, fontSize: 18, fontWeight: "800", marginTop: 12, textAlign: "center" },
  smallDesc: { color: COLORS.gray1, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 20 },
  warnIcon: { width: 60, height: 60, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  confirmDeleteBtn: {
    marginTop: 20, height: 52, borderRadius: 16, alignSelf: "stretch",
    alignItems: "center", justifyContent: "center", backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  confirmDeleteText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
});
