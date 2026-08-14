import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Modal, BackHandler, KeyboardAvoidingView, ScrollView, TextInput } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { COLORS, COUNTRIES, flagEmoji, detectDeviceCountry } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import CountryPicker from "@/src/components/CountryPicker";
import { FilledButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";

const GENDERS = ["male", "female", "other"] as const;

export default function ProfileSetup() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [gender, setGender] = useState<typeof GENDERS[number] | null>((user?.gender as any) ?? null);
  const initialDob = user?.dob ? new Date(user.dob) : null;
  const [dob, setDob] = useState<Date | null>(initialDob);
  const [showPicker, setShowPicker] = useState(false);
  const [country, setCountry] = useState<string | null>(user?.country ?? null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  // Auto-detect the user's country from device locale settings the first time they land here
  // (no permission prompt) — they can still change it via the picker below.
  useEffect(() => {
    if (!country) setCountry(detectDeviceCountry());
  }, []);

  // `user` can resolve asynchronously AFTER this screen's initial mount (e.g. a direct
  // deep-link/fast-reload landing here before AuthContext finishes its bootstrap fetch) —
  // re-sync the still-empty fields once the real user data arrives, without ever
  // overwriting anything the user has already started typing/selecting.
  useEffect(() => {
    if (!user) return;
    if (!name && user.name) setName(user.name);
    if (!gender && user.gender) setGender(user.gender as any);
    if (!dob && user.dob) setDob(new Date(user.dob));
    if (!country && user.country) setCountry(user.country);
  }, [user]);

  // This screen is a mandatory onboarding gate — it's never reused as an "edit profile"
  // screen elsewhere in the app — so the hardware back button must never let a user escape
  // it (e.g. to Home) before finishing setup. Blocking the event (returning true) is a no-op
  // from the OS's perspective; the user must use "Let's begin" to proceed.
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => true;
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [])
  );

  const valid = name.trim().length > 1 && gender && dob && country;
  const countryName = COUNTRIES.find((c) => c.code === country)?.name;

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowPicker(false);
    if (event.type === "set" && selected) setDob(selected);
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const iso = dob!.toISOString().slice(0, 10);
      await updateProfile({ name: name.trim(), gender, dob: iso, country, profile_done: true });
      router.replace(user?.deity_id ? "/(tabs)/home" : "/manifest-setup");
    } finally { setBusy(false); }
  };

  const formattedDob = dob
    ? dob.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" })
    : "";

  const now = new Date();
  const maxDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  const minDate = new Date(now.getFullYear() - 120, 0, 1);

  return (
    <View style={styles.container} testID="profile-setup-screen">
      <AnimatedBackground deityColor={COLORS.gold} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Almost there</Text>

            <Text style={styles.label}>YOUR NAME</Text>
            <TextInput
              testID="profile-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor={COLORS.gray2}
              style={styles.input}
            />

            <Text style={styles.label}>GENDER</Text>
            <View style={styles.segment}>
              {GENDERS.map((g) => {
                const active = gender === g;
                return (
                  <TouchableOpacity
                    key={g}
                    testID={`profile-gender-${g}`}
                    onPress={() => setGender(g)}
                    style={[styles.segItem, active && styles.segActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segText, active && styles.segTextActive]}>
                      {g[0].toUpperCase() + g.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>DATE OF BIRTH</Text>
            <TouchableOpacity
              testID="profile-dob-input"
              activeOpacity={0.85}
              onPress={() => setShowPicker(true)}
              style={styles.dobInput}
            >
              <Ionicons name="calendar-outline" size={18} color={COLORS.gray1} />
              <Text style={[styles.dobText, !dob && { color: COLORS.gray2 }]}>
                {dob ? formattedDob : "Select your date of birth"}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
            </TouchableOpacity>

            {/* Android inline picker */}
            {Platform.OS === "android" && showPicker && (
              <DateTimePicker
                value={dob ?? new Date(1995, 0, 1)}
                mode="date"
                display="calendar"
                minimumDate={minDate}
                maximumDate={maxDate}
                onChange={onPickerChange}
              />
            )}

            {/* iOS modal picker */}
            {Platform.OS === "ios" && (
              <Modal transparent visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
                <View style={styles.iosPickerWrap}>
                  <View style={styles.iosPickerCard}>
                    <View style={styles.iosPickerHeader}>
                      <TouchableOpacity onPress={() => setShowPicker(false)}>
                        <Text style={{ color: COLORS.gray1, fontSize: 15 }}>Cancel</Text>
                      </TouchableOpacity>
                      <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: "700" }}>Date of Birth</Text>
                      <TouchableOpacity onPress={() => setShowPicker(false)}>
                        <Text style={{ color: COLORS.gold, fontSize: 15, fontWeight: "700" }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={dob ?? new Date(1995, 0, 1)}
                      mode="date"
                      display="spinner"
                      minimumDate={minDate}
                      maximumDate={maxDate}
                      onChange={(e, d) => { if (d) setDob(d); }}
                      themeVariant="dark"
                      textColor={COLORS.white}
                    />
                  </View>
                </View>
              </Modal>
            )}

            {/* Web fallback */}
            {Platform.OS === "web" && showPicker && (
              <View style={{ marginTop: 8 }}>
                <TextInput
                  autoFocus
                  value={dob ? dob.toISOString().slice(0, 10) : ""}
                  onChangeText={(t) => {
                    const d = new Date(t);
                    if (!isNaN(d.getTime())) setDob(d);
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.gray2}
                  style={styles.input}
                  onBlur={() => setShowPicker(false)}
                />
              </View>
            )}

            <Text style={styles.label}>COUNTRY</Text>
            <TouchableOpacity
              testID="profile-country-input"
              activeOpacity={0.85}
              onPress={() => setShowCountryPicker(true)}
              style={styles.dobInput}
            >
              <Text style={{ fontSize: 18 }}>{flagEmoji(country)}</Text>
              <Text style={[styles.dobText, !country && { color: COLORS.gray2 }]}>
                {countryName || "Select your country"}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.gray2} />
            </TouchableOpacity>
            {/* "Used to show prices in your local currency" hint hidden for now — no pricing is
                shown anywhere in the app while it's fully free (pre Google Play Billing). */}

            <CountryPicker
              visible={showCountryPicker}
              selected={country ?? ""}
              onSelect={(code) => { setCountry(code); setShowCountryPicker(false); }}
              onClose={() => setShowCountryPicker(false)}
            />
          </ScrollView>
          <View style={styles.footer}>
            <FilledButton
              testID="profile-submit"
              label={busy ? "Saving..." : "Let's begin ✦"}
              onPress={submit}
              disabled={!valid || busy}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  title: { color: COLORS.white, fontSize: 32, fontWeight: "900", marginTop: 24, marginBottom: 24 },
  label: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 20, marginBottom: 8 },
  input: {
    height: 56, borderRadius: 16, backgroundColor: COLORS.surface1,
    color: COLORS.white, fontSize: 15, paddingHorizontal: 18,
  },
  segment: {
    height: 48, borderRadius: 14, backgroundColor: COLORS.surface1,
    flexDirection: "row", padding: 4,
  },
  segItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  segActive: { backgroundColor: COLORS.gold },
  segText: { color: COLORS.gray1, fontSize: 14, fontWeight: "500" },
  segTextActive: { color: COLORS.void, fontWeight: "700" },
  dobInput: {
    height: 56, borderRadius: 16, backgroundColor: COLORS.surface1,
    paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12,
  },
  dobText: { color: COLORS.white, fontSize: 15, flex: 1 },
  helperText: { color: COLORS.gray2, fontSize: 11.5, marginTop: 8 },
  iosPickerWrap: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  iosPickerCard: { backgroundColor: COLORS.surface1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  iosPickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
});
