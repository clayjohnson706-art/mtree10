import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, BackHandler } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, DEITIES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { FilledButton } from "@/src/components/ui";
import { DeityStone } from "@/src/components/DeityStone";
import { useAuth } from "@/src/context/AuthContext";

export default function DeitySelection() {
  const router = useRouter();
  const { updateProfile, user } = useAuth();
  const [selected, setSelected] = useState<number | null>(user?.deity_id ?? null);
  const [busy, setBusy] = useState(false);

  // During initial onboarding (profile not yet completed) this screen is a mandatory gate —
  // block the hardware back button so it can't be bypassed. When reached later from Settings
  // to change deity (profile already completed), allow normal back navigation.
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => !user?.profile_done;
      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [user?.profile_done])
  );

  const current = selected ? DEITIES.find((d) => d.id === selected) : null;

  const rows = [
    DEITIES.slice(0, 3),
    DEITIES.slice(3, 5),
    DEITIES.slice(5, 7),
  ];  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateProfile({ deity_id: selected });
      if (!user?.profile_done) {
        router.replace("/profile-setup");
      } else if (router.canGoBack() && !!user?.deity_id) {
        // Reached from Settings ("change deity") — return to it normally.
        router.back();
      } else {
        // Reached via a redirect chain with no back history (e.g. re-entering onboarding) —
        // router.back() would silently no-op here, leaving the user stuck on this screen.
        router.replace({ pathname: "/(tabs)/home", params: { showJourneyIntro: "1" } });
      }
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.container} testID="deity-selection-screen">
      <AnimatedBackground deityColor={current?.color ?? COLORS.electric} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Text style={styles.title}>Choose your{"\n"}guiding force</Text>
        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  testID={`deity-${d.name.toLowerCase()}`}
                  activeOpacity={0.85}
                  onPress={() => setSelected(d.id)}
                  style={[
                    styles.hex,
                    selected === d.id && { transform: [{ scale: 1.05 }] },
                  ]}
                >
                  <DeityStone
                    deityName={d.name}
                    color={selected === d.id ? d.color : COLORS.gray2}
                    glow={d.glow}
                    size={76}
                    glowIntensity={selected === d.id ? 1.5 : 0.3}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
        {current && (
          <View style={styles.nameBlock}>
            <Text style={[styles.deityName, { color: current.color }]}>
              {current.name.toUpperCase().split("").join(" ")}
            </Text>
          </View>
        )}
        <View style={styles.footer}>
          <FilledButton
            testID="deity-continue"
            label="Continue →"
            onPress={confirm}
            disabled={!selected || busy}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 24 },
  title: { color: COLORS.white, fontSize: 32, fontWeight: "900", lineHeight: 40, marginTop: 24 },
  grid: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 8 },
  row: { flexDirection: "row", justifyContent: "center", gap: 14, marginVertical: 8 },
  hex: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
  nameBlock: { alignItems: "center", marginVertical: 16 },
  deityName: { fontSize: 22, fontWeight: "300", letterSpacing: 6, fontStyle: "italic" },
  footer: { paddingBottom: 24 },
});
