import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Linking, Alert, InteractionManager } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, cancelAnimation, runOnJS, Easing } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { COLORS, DEITIES, LANGUAGES, COUNTRIES, flagEmoji } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import RequireAuth from "@/src/components/RequireAuth";
import { Card, FilledButton, Chip } from "@/src/components/ui";
import LanguagePicker from "@/src/components/LanguagePicker";
import CountryPicker from "@/src/components/CountryPicker";
import ReminderCenter from "@/src/components/ReminderCenter";
import { useAuth } from "@/src/context/AuthContext";
import { useManifestation } from "@/src/context/ManifestationContext";
import { api } from "@/src/utils/api";
import { LEGAL_LINKS } from "@/src/utils/legalLinks";
import {
  scheduleStreakReminder,
  cancelStreakReminder,
  getNotificationPermissionState,
} from "@/src/utils/notifications";

// Local helpers for the Daily Streak Reminder time picker (mirrors the pattern used by
// ReminderCenter's busy-hours/custom-time pickers).
const getLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function timeToDate(hhmm: string | null | undefined): Date {
  const d = new Date();
  if (hhmm && /^\d{2}:\d{2}$/.test(hhmm)) {
    const [h, m] = hhmm.split(":").map(Number);
    d.setHours(h); d.setMinutes(m);
  } else {
    d.setHours(20); d.setMinutes(0);
  }
  d.setSeconds(0); d.setMilliseconds(0);
  return d;
}
function dateToTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const suf = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suf}`;
}

// No Google Play Billing account is set up yet — the app is fully free for now (no real
// payment processing anywhere). Flip this back to `true` once billing is integrated to
// restore the real "Manage Subscription" / plans flow; nothing else needs to change.
const SUBSCRIPTIONS_ENABLED = false;

// Hold duration (ms) required to trigger sign out — an intentional, hard-to-trigger-by-accident
// gesture (see the Pressable + progress-ring below) that replaces the old tap + confirm-dialog
// flow entirely; the hold itself IS the confirmation.
const SIGN_OUT_HOLD_MS = 2400;

export default function Settings() {
  const router = useRouter();
  const { user, updateProfile, signOut, deleteAccount, refresh } = useAuth();
  const deity = DEITIES.find((d) => d.id === user?.deity_id) || DEITIES[0];
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showReminderCenter, setShowReminderCenter] = useState(false);
  // Shared across Home/Ritual/Settings — see ManifestationContext. Reacts instantly when a
  // manifestation is deleted/completed/created from another tab, instead of only picking it up
  // the next time this screen regains focus.
  const { active, setActive, refresh: refreshManifestation } = useManifestation();
  const [showDeityLocked, setShowDeityLocked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signOutHoldProgress = useSharedValue(0);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isPremium = !!user?.is_premium;

  // Daily Streak Reminder — a single, always-free daily nudge (independent of the premium
  // multi-time Reminder Center above). Defaults to ON (opt-out, not opt-in) — only an
  // explicit `false` from the backend is treated as disabled.
  const [streakReminderEnabled, setStreakReminderEnabled] = useState<boolean>(user?.streak_reminder_enabled !== false);
  const [streakReminderTime, setStreakReminderTime] = useState<string>(user?.streak_reminder_time ?? "20:00");
  const [showStreakTimePicker, setShowStreakTimePicker] = useState(false);
  const [streakPermBlocked, setStreakPermBlocked] = useState(false);
  React.useEffect(() => {
    if (user) {
      setStreakReminderEnabled(user.streak_reminder_enabled !== false);
      setStreakReminderTime(user.streak_reminder_time ?? "20:00");
    }
  }, [user?.streak_reminder_enabled, user?.streak_reminder_time]);

  const onToggleStreakReminder = async (v: boolean) => {
    setStreakReminderEnabled(v); // instant UI feedback
    try {
      await updateProfile({ streak_reminder_enabled: v });
    } catch {
      setStreakReminderEnabled(!v);
      return;
    }
    if (!v) {
      await cancelStreakReminder();
      setStreakPermBlocked(false);
      return;
    }
    const state = await getNotificationPermissionState();
    if (state === "blocked") { setStreakPermBlocked(true); return; }
    const doSchedule = async () => {
      const todayLocal = getLocalDateStr(new Date());
      const doneToday = active?.last_ritual_local_date === todayLocal;
      const result = await scheduleStreakReminder(streakReminderTime, doneToday);
      setStreakPermBlocked(!result.scheduled && result.permission === "blocked");
    };
    if (state === "undetermined" || state === "denied") {
      Alert.alert(
        "Enable Notifications?",
        "Allow mTree to send you one gentle reminder a day so you never break your streak.",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Allow", onPress: doSchedule },
        ]
      );
    } else {
      await doSchedule();
    }
  };

  const applyStreakTime = async (t: string) => {
    setStreakReminderTime(t);
    try {
      await updateProfile({ streak_reminder_time: t });
      if (streakReminderEnabled) {
        const todayLocal = getLocalDateStr(new Date());
        const doneToday = active?.last_ritual_local_date === todayLocal;
        const result = await scheduleStreakReminder(t, doneToday);
        setStreakPermBlocked(!result.scheduled && result.permission === "blocked");
      }
    } catch {}
  };

  const onStreakPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowStreakTimePicker(false);
    if (event.type === "set" && selected) applyStreakTime(dateToTime(selected));
  };

  // Username edit — ONLY the name is editable here; email + gender stay read-only (set once
  // during sign-up / profile-setup and never exposed as editable fields in this screen).
  const [showEditName, setShowEditName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");

  const openEditName = () => {
    setNameInput(user?.name || "");
    setNameError("");
    setShowEditName(true);
  };

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (trimmed.length < 2) { setNameError("Name must be at least 2 characters."); return; }
    if (trimmed.length > 40) { setNameError("Name must be under 40 characters."); return; }
    setSavingName(true);
    setNameError("");
    try {
      await updateProfile({ name: trimmed });
      setShowEditName(false);
    } catch {
      setNameError("Couldn't save — check your connection and try again.");
    } finally {
      setSavingName(false);
    }
  };

  // Local, optimistic mirror of the Public Profile setting — the Switch reads this instead of
  // `user?.is_public` directly so it flips instantly on tap. Kept in sync whenever the real
  // value changes elsewhere (e.g. a fresh profile load).
  const [isPublicLocal, setIsPublicLocal] = useState<boolean>(user?.is_public ?? true);
  React.useEffect(() => {
    if (user) setIsPublicLocal(user.is_public);
  }, [user?.is_public]);

  // Re-check for an active manifestation every time Settings gains focus, so "Change Deity"
  // automatically unlocks again once it's completed or deleted (from here or from Home).
  // Deferred via InteractionManager so this fetch + its setState don't run on the exact same
  // frames as the incoming screen transition — it waits until that animation has settled,
  // instead of competing with it, which is what caused visible stutter on rapid navigation.
  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        refreshManifestation().catch(() => {});
      });
      return () => task.cancel();
    }, [])
  );

  const togglePublic = (v: boolean) => {
    setIsPublicLocal(v); // instant UI feedback — persists in the background below
    updateProfile({ is_public: v }).catch(() => {
      setIsPublicLocal(!v); // revert only if the save actually failed
    });
  };

  const setLang = async (lang: string) => {
    if (!isPremium) { router.push("/paywall"); return; }
    await updateProfile({ affirmation_language: lang });
    setShowLangPicker(false);
  };

  const setCountry = async (code: string) => {
    setShowCountryPicker(false);
    await updateProfile({ country: code });
  };

  const onChangeDeityPress = () => {
    if (active) setShowDeityLocked(true);
    else router.push("/deity");
  };

  const confirmDeleteManifestation = async () => {
    if (!active) return;
    setDeleting(true);
    try {
      await api(`/manifestations/${active.id}/abandon`, { method: "POST" });
      setActive(null);
      setShowDeleteConfirm(false);
      setShowDeityLocked(false);
    } finally { setDeleting(false); }
  };

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await deleteAccount();
      // Navigation is handled centrally by AuthNavGuard (app/_layout.tsx) the instant `user`
      // transitions to null — it clears the entire stack and lands directly on /auth.
    } finally { setDeletingAccount(false); }
  };

  const confirmSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await signOut();
      // Navigation is handled centrally by AuthNavGuard (app/_layout.tsx) the instant `user`
      // transitions to null — it clears the entire stack and lands directly on /auth.
    } finally {
      setSigningOut(false);
    }
  };

  // "Hold to Sign Out" — the hold itself is the confirmation (no separate dialog). A scroll or
  // quick accidental brush can never trigger it: `onPressOut` fires the moment the ScrollView
  // claims the touch (or the finger simply lifts), which cancels the fill animation well before
  // it could ever reach 100% — only a deliberate, sustained ~2.4s hold completes it.
  const startSignOutHold = () => {
    if (signingOut) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    signOutHoldProgress.value = withTiming(
      1,
      { duration: SIGN_OUT_HOLD_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(confirmSignOut)();
      }
    );
  };
  const cancelSignOutHold = () => {
    cancelAnimation(signOutHoldProgress);
    signOutHoldProgress.value = withTiming(0, { duration: 180 });
  };
  const signOutProgressStyle = useAnimatedStyle(() => ({ width: `${signOutHoldProgress.value * 100}%` }));

  return (
    <RequireAuth>
    <View style={styles.container} testID="settings-screen">
      <AnimatedBackground deityColor={deity.color} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="settings-back">
            <Ionicons name="chevron-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={styles.section}>ACCOUNT</Text>
          <Card>
            <TouchableOpacity onPress={openEditName} testID="settings-edit-name-row" activeOpacity={0.7}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Name</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.rowValue} numberOfLines={1}>{user?.name || ""}</Text>
                  <Ionicons name="pencil" size={14} color={COLORS.gold} />
                </View>
              </View>
            </TouchableOpacity>
            <SettingRow label="Email" value={user?.email || ""} />
            <SettingRow label="Gender" value={user?.gender || "-"} />
          </Card>

          <Text style={styles.section}>DEITY</Text>
          <Card onPress={onChangeDeityPress} testID="settings-change-deity">
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Current</Text>
              <Text style={[styles.rowValue, { color: deity.color, fontStyle: "italic" }]}>{deity.name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: COLORS.gold, fontWeight: "700" }]}>Change Deity</Text>
              <Ionicons name={active ? "lock-closed" : "chevron-forward"} size={18} color={COLORS.gray2} />
            </View>
          </Card>

          <Text style={styles.section}>REMINDERS {!isPremium && "🔒"}</Text>
          <Card
            onPress={() => (isPremium && active ? setShowReminderCenter(true) : !isPremium ? router.push("/paywall") : undefined)}
            testID="settings-reminders-row"
          >
            <View style={styles.row}>
              <View>
                <Text style={styles.rowLabel}>Reminder Center</Text>
                <Text style={styles.rowSub}>
                  {!active
                    ? "Start a manifestation to enable reminders"
                    : (user?.notification_count ?? 0) > 0
                    ? `${user?.notification_count}x/day · ${user?.reminder_mode === "custom" ? "Custom" : "Random"}`
                    : "Off"}
                </Text>
              </View>
              <Ionicons name={active ? "chevron-forward" : "lock-closed"} size={18} color={COLORS.gray2} />
            </View>
          </Card>

          <Text style={styles.section}>DAILY STREAK REMINDER</Text>
          <Card testID="settings-streak-reminder-card">
            {streakPermBlocked && (
              <View style={styles.permBanner} testID="streak-reminder-permission-banner">
                <Ionicons name="notifications-off-outline" size={16} color={COLORS.warning} />
                <Text style={styles.permBannerText}>
                  Notifications are off for mTree in your device settings.
                </Text>
                <TouchableOpacity
                  testID="streak-reminder-open-settings"
                  onPress={() => Linking.openSettings()}
                  style={styles.permBannerBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.permBannerBtnText}>Open Settings</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.rowLabel}>Remind me daily</Text>
                <Text style={styles.rowSub}>
                  {streakReminderEnabled ? `Once a day at ${formatTime(streakReminderTime)}` : "Off — never miss your streak"}
                </Text>
              </View>
              <Switch
                testID="settings-streak-reminder-toggle"
                value={streakReminderEnabled}
                onValueChange={onToggleStreakReminder}
                trackColor={{ true: COLORS.gold, false: COLORS.gray3 }}
                thumbColor={COLORS.white}
              />
            </View>
            {streakReminderEnabled && (
              <TouchableOpacity
                testID="settings-streak-reminder-time"
                onPress={() => setShowStreakTimePicker(true)}
                style={[styles.row, { borderTopWidth: 1, borderTopColor: COLORS.gray3, marginTop: 4, paddingTop: 12 }]}
                activeOpacity={0.7}
              >
                <Text style={styles.rowLabel}>Reminder Time</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.rowValue, { color: COLORS.gold }]}>{formatTime(streakReminderTime)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.gray2} />
                </View>
              </TouchableOpacity>
            )}
          </Card>

          <Text style={styles.section}>AFFIRMATION {!isPremium && "🔒"}</Text>
          <Card onPress={() => (isPremium ? setShowLangPicker(true) : router.push("/paywall"))} testID="settings-language-row">
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Language</Text>
              <Text style={[styles.rowValue, { color: COLORS.gold }]} numberOfLines={1}>
                {LANGUAGES.find((l) => l.code === user?.affirmation_language)?.label ?? "English"}
              </Text>
            </View>
          </Card>

          <Text style={styles.section}>REGION</Text>
          <Card onPress={() => setShowCountryPicker(true)} testID="settings-country-row">
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Country</Text>
              <Text style={[styles.rowValue, { color: COLORS.gold }]} numberOfLines={1}>
                {flagEmoji(user?.country)} {COUNTRIES.find((c) => c.code === user?.country)?.name ?? "Select country"}
              </Text>
            </View>
          </Card>

          <Text style={styles.section}>PRIVACY</Text>
          <Card>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Public Profile</Text>
              <Switch
                testID="settings-public-toggle"
                value={isPublicLocal}
                onValueChange={togglePublic}
                trackColor={{ true: COLORS.gold, false: COLORS.gray3 }}
                thumbColor={COLORS.white}
              />
            </View>
          </Card>

          <Text style={styles.section}>SUBSCRIPTION</Text>
          {SUBSCRIPTIONS_ENABLED ? (
            <Card testID="settings-subscription" onPress={() => router.push("/subscription")}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Status</Text>
                <View style={[styles.pill, { backgroundColor: (isPremium ? COLORS.success : COLORS.gray3) + "20" }]}>
                  <Text style={{ color: isPremium ? COLORS.success : COLORS.gray1, fontSize: 12, fontWeight: "800" }}>
                    {isPremium ? "PREMIUM ✦" : "FREE"}
                  </Text>
                </View>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: COLORS.gold, fontWeight: "700" }]}>
                  {isPremium ? "Manage Subscription" : "View Plans & Upgrade"}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
              </View>
            </Card>
          ) : (
            // No billing account configured yet — the app is fully free for everyone for now, so
            // there's nothing to "manage". Flip SUBSCRIPTIONS_ENABLED back to true (above) once
            // Google Play Billing is integrated to restore the real plans/upgrade flow.
            <Card testID="settings-subscription">
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Status</Text>
                <View style={[styles.pill, { backgroundColor: COLORS.success + "20" }]}>
                  <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: "800" }}>FREE ✦</Text>
                </View>
              </View>
              <Text style={styles.rowSub}>All features are free for everyone right now — nothing to pay or manage.</Text>
            </Card>
          )}

          <Text style={styles.section}>HELP &amp; SUPPORT</Text>
          <Card testID="settings-help-faq" onPress={() => router.push("/help")}>
            <View style={styles.row}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="help-circle-outline" size={16} color={COLORS.gray1} />
                <Text style={styles.rowLabel}>Help &amp; FAQ</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
            </View>
          </Card>
          <Card style={{ marginTop: 10 }} testID="settings-contact-us" onPress={() => router.push("/contact")}>
            <View style={styles.row}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.gray1} />
                <Text style={styles.rowLabel}>Contact Us</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
            </View>
          </Card>

          {active && (
            <>
              <Text style={styles.section}>MANIFESTATION</Text>
              <Card>
                <TouchableOpacity onPress={() => setShowDeleteConfirm(true)} testID="settings-abandon" activeOpacity={0.85}>
                  <Text style={{ color: COLORS.danger, fontSize: 14, fontWeight: "600", padding: 6 }}>
                    Abandon Manifestation
                  </Text>
                </TouchableOpacity>
              </Card>
            </>
          )}

          {/* Hold to Sign Out — replaces the old tap+confirm-dialog flow. The hold IS the
              confirmation: a full ~2.4s deliberate press-and-hold (with a filling progress bar
              as visual feedback) triggers sign out; releasing early cancels with no effect.
              Scrolling can never trigger it — the ScrollView claiming the gesture (or simply
              lifting the finger) fires `onPressOut`, which cancels the fill well before 100%. */}
          <Pressable
            testID="settings-signout"
            onPressIn={startSignOutHold}
            onPressOut={cancelSignOutHold}
            disabled={signingOut}
            style={styles.signOutBtn}
          >
            <View style={styles.signOutProgressTrack}>
              <Animated.View style={[styles.signOutProgressFill, signOutProgressStyle]} />
            </View>
            <View style={styles.signOutContent}>
              <Ionicons name="log-out-outline" size={16} color={COLORS.danger} />
              <Text style={styles.signOutBtnText}>{signingOut ? "Signing out..." : "Hold to Sign Out"}</Text>
            </View>
          </Pressable>

          <Text style={styles.section}>LEGAL</Text>
          <Card style={{ paddingVertical: 4 }}>
            <LegalRow
              testID="settings-legal-privacy-policy"
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              onPress={() => Linking.openURL(LEGAL_LINKS.privacyPolicy)}
            />
            <LegalRow
              testID="settings-legal-terms"
              icon="document-text-outline"
              label="Terms & Conditions"
              onPress={() => Linking.openURL(LEGAL_LINKS.termsAndConditions)}
            />
            {/* Refund Policy row hidden for now — no payments are collected anywhere in the app
                (donations/subscriptions hidden too) until Google Play Billing is integrated. */}
            <LegalRow
              testID="settings-legal-account-deletion"
              icon="trash-outline"
              label="Account Deletion Policy"
              onPress={() => Linking.openURL(LEGAL_LINKS.accountDeletion)}
              isLast
            />
          </Card>

          <TouchableOpacity
            testID="settings-delete-account"
            onPress={() => setShowDeleteAccountConfirm(true)}
            style={{ marginTop: 20, alignSelf: "center", padding: 10 }}
          >
            <Text style={{ color: COLORS.gray2, fontSize: 13, fontWeight: "600", textDecorationLine: "underline" }}>
              Delete Account
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Edit Name — only the username can be changed here; email + gender are fixed */}
        <Modal transparent visible={showEditName} animationType="fade" onRequestClose={() => setShowEditName(false)}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Pressable style={styles.centerBackdrop} onPress={() => setShowEditName(false)}>
              <Pressable style={styles.lockCard} onPress={(e) => e.stopPropagation()} testID="edit-name-card">
                <View style={[styles.warnIcon, { backgroundColor: COLORS.gold + "22" }]}>
                  <Ionicons name="pencil" size={26} color={COLORS.gold} />
                </View>
                <Text style={styles.lockTitle}>Change Your Name</Text>
                <Text style={styles.lockDesc}>Only your name can be changed. Email and gender stay fixed.</Text>
                <TextInput
                  testID="edit-name-input"
                  value={nameInput}
                  onChangeText={(t) => { setNameInput(t); setNameError(""); }}
                  placeholder="Your name"
                  placeholderTextColor={COLORS.gray2}
                  style={styles.nameInput}
                  maxLength={40}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                />
                {!!nameError && <Text style={styles.nameError} testID="edit-name-error">{nameError}</Text>}
                <FilledButton
                  testID="edit-name-save"
                  label={savingName ? "Saving..." : "Save"}
                  onPress={saveName}
                  disabled={savingName}
                  style={{ marginTop: 16, alignSelf: "stretch" }}
                />
                <TouchableOpacity
                  onPress={() => setShowEditName(false)}
                  style={{ marginTop: 10, alignSelf: "stretch", alignItems: "center", padding: 10 }}
                  testID="edit-name-cancel"
                >
                  <Text style={{ color: COLORS.gray1, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>

        {/* Deity change locked — active manifestation in progress */}
        <Modal transparent visible={showDeityLocked} animationType="fade" onRequestClose={() => setShowDeityLocked(false)}>
          <Pressable style={styles.centerBackdrop} onPress={() => setShowDeityLocked(false)}>
            <Pressable style={styles.lockCard} onPress={(e) => e.stopPropagation()} testID="deity-locked-card">
              <View style={[styles.warnIcon, { backgroundColor: COLORS.gold + "20" }]}>
                <Ionicons name="lock-closed" size={30} color={COLORS.gold} />
              </View>
              <Text style={styles.lockTitle}>Deity Locked</Text>
              <Text style={styles.lockDesc}>
                You have an ongoing manifestation. Please complete your current manifestation or delete it before changing your Deity.
              </Text>
              <FilledButton
                testID="deity-locked-ok"
                label="OK"
                onPress={() => setShowDeityLocked(false)}
                style={{ marginTop: 20, alignSelf: "stretch" }}
              />
              <TouchableOpacity
                testID="deity-locked-delete-shortcut"
                onPress={() => { setShowDeityLocked(false); setShowDeleteConfirm(true); }}
                style={{ marginTop: 12, alignSelf: "stretch", alignItems: "center", padding: 10 }}
              >
                <Text style={{ color: COLORS.danger, fontSize: 14, fontWeight: "700" }}>Delete Current Manifestation</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Delete manifestation confirmation */}
        <Modal transparent visible={showDeleteConfirm} animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
          <Pressable style={styles.centerBackdrop} onPress={() => setShowDeleteConfirm(false)}>
            <Pressable style={styles.lockCard} onPress={(e) => e.stopPropagation()} testID="delete-confirm-card">
              <View style={[styles.warnIcon, { backgroundColor: COLORS.danger + "22" }]}>
                <Ionicons name="trash" size={30} color={COLORS.danger} />
              </View>
              <Text style={styles.lockTitle}>Delete this manifestation?</Text>
              <Text style={styles.lockDesc}>
                Your progress and streak will be reset. You will be free to set a new Goal, Sacrifice, or Deity.
              </Text>
              <TouchableOpacity
                testID="delete-confirm-yes"
                onPress={confirmDeleteManifestation}
                disabled={deleting}
                style={styles.confirmDeleteBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmDeleteText}>{deleting ? "Deleting..." : "Yes, delete it"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={{ marginTop: 10, alignSelf: "stretch", alignItems: "center", padding: 10 }} testID="delete-confirm-cancel">
                <Text style={{ color: COLORS.gray1, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Delete account confirmation */}
        <Modal transparent visible={showDeleteAccountConfirm} animationType="fade" onRequestClose={() => setShowDeleteAccountConfirm(false)}>
          <Pressable style={styles.centerBackdrop} onPress={() => setShowDeleteAccountConfirm(false)}>
            <Pressable style={styles.lockCard} onPress={(e) => e.stopPropagation()} testID="delete-account-card">
              <View style={[styles.warnIcon, { backgroundColor: COLORS.danger + "22" }]}>
                <Ionicons name="warning" size={30} color={COLORS.danger} />
              </View>
              <Text style={styles.lockTitle}>Delete your account?</Text>
              <Text style={styles.lockDesc}>
                This permanently deletes your account and all associated data — manifestations, garden, saved cards, and profile. This cannot be undone.
              </Text>
              <TouchableOpacity
                testID="delete-account-yes"
                onPress={confirmDeleteAccount}
                disabled={deletingAccount}
                style={styles.confirmDeleteBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmDeleteText}>{deletingAccount ? "Deleting..." : "Yes, delete my account"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowDeleteAccountConfirm(false)} style={{ marginTop: 10, alignSelf: "stretch", alignItems: "center", padding: 10 }} testID="delete-account-cancel">
                <Text style={{ color: COLORS.gray1, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Daily Streak Reminder — time picker (Android inline, iOS bottom-sheet spinner,
            Web quick-preset chips — same platform pattern as ReminderCenter's pickers) */}
        {Platform.OS === "android" && showStreakTimePicker && (
          <DateTimePicker
            value={timeToDate(streakReminderTime)}
            mode="time"
            display="clock"
            is24Hour={false}
            onChange={onStreakPickerChange}
          />
        )}
        {Platform.OS === "ios" && (
          <Modal transparent visible={showStreakTimePicker} animationType="slide" onRequestClose={() => setShowStreakTimePicker(false)}>
            <View style={styles.iosPickerWrap}>
              <View style={styles.iosPickerCard}>
                <View style={styles.iosPickerHeader}>
                  <TouchableOpacity onPress={() => setShowStreakTimePicker(false)}>
                    <Text style={{ color: COLORS.gray1, fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: "700" }}>Reminder Time</Text>
                  <TouchableOpacity onPress={() => setShowStreakTimePicker(false)}>
                    <Text style={{ color: COLORS.gold, fontSize: 15, fontWeight: "700" }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={timeToDate(streakReminderTime)}
                  mode="time"
                  display="spinner"
                  onChange={(_, d) => { if (d) applyStreakTime(dateToTime(d)); }}
                  themeVariant="dark"
                  textColor={COLORS.white}
                />
              </View>
            </View>
          </Modal>
        )}
        {Platform.OS === "web" && showStreakTimePicker && (
          <Modal transparent visible={showStreakTimePicker} animationType="fade" onRequestClose={() => setShowStreakTimePicker(false)}>
            <Pressable style={styles.centerBackdrop} onPress={() => setShowStreakTimePicker(false)}>
              <Pressable style={styles.lockCard} onPress={(e) => e.stopPropagation()} testID="streak-time-web-card">
                <Text style={styles.lockTitle}>Reminder Time</Text>
                <View style={[styles.chipWrap, { marginTop: 16, justifyContent: "center" }]}>
                  {["06:00", "07:00", "08:00", "09:00", "12:00", "14:00", "16:00", "18:00", "20:00", "21:00", "22:00", "23:00"].map((t) => (
                    <Chip
                      key={t}
                      label={formatTime(t)}
                      selected={streakReminderTime === t}
                      onPress={() => applyStreakTime(t)}
                    />
                  ))}
                </View>
                <FilledButton
                  testID="streak-time-web-done"
                  label="Done"
                  onPress={() => setShowStreakTimePicker(false)}
                  style={{ marginTop: 20, alignSelf: "stretch" }}
                />
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </SafeAreaView>
      <LanguagePicker
        visible={showLangPicker}
        selected={user?.affirmation_language ?? "english"}
        onSelect={setLang}
        onClose={() => setShowLangPicker(false)}
      />
      <CountryPicker
        visible={showCountryPicker}
        selected={user?.country ?? ""}
        onSelect={setCountry}
        onClose={() => setShowCountryPicker(false)}
      />
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
          onSaved={async () => {
            try { setActive(await api<any>("/manifestations/active")); } catch {}
            refresh();
          }}
        />
      )}
    </View>
    </RequireAuth>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// Row inside the "LEGAL" card — opens the official Google Sites page for that document in the
// device's browser (Linking.openURL), never inside the app itself.
function LegalRow({
  icon,
  label,
  onPress,
  testID,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.legalRow, !isLast && styles.legalRowBorder]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name={icon} size={16} color={COLORS.gold} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={COLORS.gray2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "800" },
  section: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 20, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  rowLabel: { color: COLORS.gray1, fontSize: 13 },
  rowSub: { color: COLORS.gray2, fontSize: 11.5, marginTop: 3 },
  rowValue: { color: COLORS.white, fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right", marginLeft: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  busyPill: { flex: 1, height: 60, borderRadius: 16, backgroundColor: COLORS.surface2, justifyContent: "center", paddingHorizontal: 16 },
  busyLabel: { color: COLORS.gray2, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  busyTime: { color: COLORS.white, fontSize: 16, fontWeight: "800", marginTop: 4 },
  segment: { height: 44, borderRadius: 12, backgroundColor: COLORS.surface2, flexDirection: "row", padding: 3, marginTop: 8 },
  segItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  segActive: { backgroundColor: COLORS.gold },
  segText: { color: COLORS.gray1, fontSize: 13, fontWeight: "600" },
  segTextActive: { color: COLORS.void, fontWeight: "800" },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  permBanner: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8,
    backgroundColor: COLORS.warning + "16", borderWidth: 1, borderColor: COLORS.warning + "40",
    borderRadius: 14, padding: 12, marginBottom: 10,
  },
  permBannerText: { color: COLORS.gray1, fontSize: 12, lineHeight: 16, flex: 1, minWidth: 120 },
  permBannerBtn: { backgroundColor: COLORS.warning, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  permBannerBtnText: { color: COLORS.void, fontSize: 12, fontWeight: "800" },
  iosPickerWrap: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  iosPickerCard: { backgroundColor: COLORS.surface1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  iosPickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 },

  centerBackdrop: { flex: 1, backgroundColor: "#000000E8", alignItems: "center", justifyContent: "center", padding: 24 },
  lockCard: {
    width: "100%", borderRadius: 24, backgroundColor: COLORS.surface1,
    padding: 24, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 18,
  },
  warnIcon: { width: 60, height: 60, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  lockTitle: { color: COLORS.white, fontSize: 18, fontWeight: "800", marginTop: 12, textAlign: "center" },
  lockDesc: { color: COLORS.gray1, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 20 },
  nameInput: {
    marginTop: 18,
    alignSelf: "stretch",
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.white,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.gray3,
  },
  nameError: { color: COLORS.danger, fontSize: 12, marginTop: 8, textAlign: "center" },
  confirmDeleteBtn: {
    marginTop: 20, height: 52, borderRadius: 16, alignSelf: "stretch",
    alignItems: "center", justifyContent: "center", backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  confirmDeleteText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  legalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  legalRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.gray3 },
  signOutBtn: {
    marginTop: 24, height: 48, borderRadius: 14, alignSelf: "stretch",
    backgroundColor: COLORS.danger + "12", overflow: "hidden",
  },
  signOutProgressTrack: { position: "absolute", top: 0, left: 0, bottom: 0, right: 0 },
  signOutProgressFill: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: COLORS.danger + "30" },
  signOutContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  signOutBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: "700" },
});
