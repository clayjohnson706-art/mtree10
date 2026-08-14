import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Share, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, withSpring } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { COLORS, DEITIES, GOAL_CATEGORIES, getCurrencyInfo, formatPrice, convertFromINR } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { FilledButton, GhostButton, Card } from "@/src/components/ui";
import { DeityStone } from "@/src/components/DeityStone";
import AchievementCard from "@/src/components/AchievementCard";
import { api } from "@/src/utils/api";
import { useAuth } from "@/src/context/AuthContext";

type Step = "donation" | "share" | "done";

// Fixed donation tiers, authored in INR and auto-converted to the user's localized currency
// for display (mirrors how subscription pricing in PRICING/formatPrice works).
const DONATION_TIERS_INR = [101, 201, 501, 1001, 10001, 50001];

// Donations require real payment processing (Google Play Billing on Android). Until that's
// integrated, no payment collection UI should ever be shown to users — flip this back to
// `true` once Play Billing is wired up. Everything below reacts to this single flag; nothing
// else needs to change to bring donations back later.
const DONATIONS_ENABLED = false;

export default function Success() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const deity = DEITIES.find((d) => d.id === user?.deity_id) || DEITIES[0];
  const currency = getCurrencyInfo(user?.country);
  const [step, setStep] = useState<Step>("donation");
  const [testimony, setTestimony] = useState("");
  const [selectedTierInr, setSelectedTierInr] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [manifestation, setManifestation] = useState<any>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const [shareBanner, setShareBanner] = useState<string | null>(null);
  const viewShotRef = useRef<ViewShot>(null);
  const cardWebRef = useRef<View>(null);

  const flashBanner = (msg: string) => {
    setShareBanner(msg);
    setTimeout(() => setShareBanner(null), 3000);
  };

  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 90 });
    opacity.value = withDelay(200, withTiming(1, { duration: 600 }));
    // fetch active/manifestation info for share text
    (async () => {
      try {
        const m = await api<any>("/manifestations/active");
        if (m?.id === id) setManifestation(m);
      } catch {}
    })();
  }, []);

  const stoneStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const goal = manifestation ? GOAL_CATEGORIES.find((g) => g.key === manifestation.goal_category) : null;

  const finalize = async (donationAmt: number) => {
    if (!id) return null;
    setBusy(true);
    try {
      const m = await api<any>(`/manifestations/${id}/manifested`, {
        method: "POST",
        body: { testimony: testimony || null, donation_amount: donationAmt, donation_currency: currency.code },
      });
      setManifestation(m);
      return m;
    } finally { setBusy(false); }
  };

  const submitDonation = async () => {
    if (!selectedTierInr) return;
    // Backend's donation_amount field is a strict int — convertFromINR() can return a
    // fractional value for many currencies (e.g. ₹501 -> $6.06), so round before sending.
    // Floor at 1 so very-low-value currencies (KWD/BHD/OMR/JOD) never round down to 0,
    // which would otherwise be indistinguishable from skipping the donation entirely.
    const localAmt = Math.max(1, Math.round(convertFromINR(selectedTierInr, user?.country)));
    try {
      await finalize(localAmt);
      setStep("share");
    } catch (e: any) {
      Alert.alert("Couldn't seal this manifestation", e?.message?.includes("API") ? "Please check your connection and try again." : String(e?.message || "Something went wrong. Please try again."));
    }
  };

  const skipDonation = async () => {
    try {
      await finalize(0);
      setStep("share");
    } catch (e: any) {
      Alert.alert("Couldn't seal this manifestation", "Please check your connection and try again.");
    }
  };

  const shareStory = async () => {
    const label = manifestation?.goal_category === "custom"
      ? "my personal goal"
      : (goal?.label?.toLowerCase() ?? "my goal");
    const message = `✦ It came true — I manifested ${label} through ${manifestation?.cycle_days ?? ""} days of ritual with ${deity.name} as my guide. #mTree`;

    // react-native's Share.share() has no implementation on react-native-web (silently
    // no-ops), so web gets its own path: native Web Share API for text first, then a
    // clipboard-copy fallback — both give the user real, visible feedback via flashBanner().
    if (Platform.OS === "web") {
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      try {
        if (nav?.share) {
          await nav.share({ text: message, title: "My mTree Manifestation" });
          return;
        }
      } catch {
        return; // user cancelled the browser's native share sheet — not an error
      }
      try {
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(message);
          flashBanner("Story copied to clipboard!");
          return;
        }
      } catch {}
      flashBanner("Couldn't share on this browser.");
      return;
    }

    try {
      await Share.share({ message, title: "My mTree Manifestation" });
    } catch {}
  };

  const achievedDateLabel = new Date(manifestation?.manifested_at || Date.now()).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Captures the branded AchievementCard as a PNG and shares it as an image.
  // Native (iOS/Android): react-native-view-shot's captureRef() against the <ViewShot> ref
  // gives a real temp-file URI, shared via expo-sharing.
  // Web: react-native-view-shot@4's captureRef() calls RN's findNodeHandle() BEFORE ever
  // reaching its own web implementation, and findNodeHandle is not supported by
  // react-native-web — so on web we bypass the library entirely and capture the plain DOM
  // node (react-native-web forwards View refs to the underlying <div>) directly with
  // html2canvas (already a transitive dependency of react-native-view-shot, no extra
  // package needed), then try the Web Share API (with file support) before falling back to
  // a plain browser download. Every failure path shows a visible flashBanner() (RN's
  // Alert.alert has no UI implementation on web either) instead of failing silently.
  const shareAchievementImage = async () => {
    setSharingImage(true);
    try {
      if (Platform.OS === "web") {
        const node = cardWebRef.current as unknown as HTMLElement | null;
        if (!node) throw new Error("Card not ready yet");
        const { default: html2canvas } = await import("html2canvas");
        const canvas = await html2canvas(node, { backgroundColor: null, scale: 2, useCORS: true });
        const dataUrl = canvas.toDataURL("image/png");

        let handled = false;
        const nav: any = typeof navigator !== "undefined" ? navigator : null;
        try {
          if (nav?.share && nav?.canShare) {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], "mtree-achievement.png", { type: "image/png" });
            if (nav.canShare({ files: [file] })) {
              await nav.share({ files: [file], title: "My mTree Manifestation" });
              handled = true;
            }
          }
        } catch {
          handled = true; // user cancelled the share sheet — don't also trigger a download
        }
        if (!handled && typeof document !== "undefined") {
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = "mtree-achievement.png";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          flashBanner("Image downloaded ✓");
        }
      } else {
        if (!viewShotRef.current) throw new Error("Card not ready yet");
        const uri = await captureRef(viewShotRef, { format: "png", quality: 0.95, result: "tmpfile" });
        const canShareFile = await Sharing.isAvailableAsync();
        if (canShareFile) {
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your mTree achievement" });
        } else {
          await shareStory();
        }
      }
    } catch (e) {
      console.warn("Achievement image share failed", e);
      if (Platform.OS === "web") {
        flashBanner("Couldn't create image — sharing as text instead.");
      } else {
        Alert.alert("Couldn't create image", "Sharing as text instead.");
      }
      await shareStory();
    } finally {
      setSharingImage(false);
    }
  };

  const finishAndGo = () => router.replace("/(tabs)/home");

  return (
    <View style={styles.container} testID="success-screen">
      <AnimatedBackground deityColor={deity.color} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Animated.View style={[styles.stoneWrap, stoneStyle]}>
            <DeityStone deityName={deity.name} color={deity.color} glow={deity.glow} size={120} glowIntensity={1.5} />
          </Animated.View>
          <Animated.View style={textStyle}>
            <Text style={styles.title}>Manifested</Text>
            <Text style={styles.sub}>The universe has answered your intention.</Text>
          </Animated.View>

          {/* Stepper */}
          <View style={styles.stepper}>
            <StepDot label={DONATIONS_ENABLED ? "Donation" : "Reflect"} active={step === "donation"} done={step !== "donation"} />
            <View style={styles.stepLine} />
            <StepDot label="Share" active={step === "share"} done={step === "done"} />
          </View>

          {step === "donation" && (
            <>
              <Text style={styles.label}>YOUR TESTIMONY (Optional)</Text>
              <TextInput
                testID="success-testimony"
                value={testimony}
                onChangeText={setTestimony}
                placeholder="Share your story..."
                placeholderTextColor={COLORS.gray2}
                style={[styles.input, { height: 100, textAlignVertical: "top" }]}
                multiline
                maxLength={500}
              />

              {DONATIONS_ENABLED && (
                <Card style={{ marginTop: 20, overflow: "hidden" }}>
                  <LinearGradient colors={[COLORS.gold + "18", COLORS.surface1]} style={StyleSheet.absoluteFillObject} />
                  <Text style={styles.donateTitle}>Would you like to give back?</Text>
                  <Text style={styles.donateSub}>Support the cosmic energy. Choose an amount.</Text>
                  <View style={styles.tierGrid}>
                    {DONATION_TIERS_INR.map((inr) => {
                      const active = selectedTierInr === inr;
                      return (
                        <TouchableOpacity
                          key={inr}
                          testID={`success-donation-tier-${inr}`}
                          onPress={() => setSelectedTierInr(inr)}
                          style={[styles.tierChip, active && styles.tierChipActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.tierChipText, active && styles.tierChipTextActive]}>
                            {formatPrice(inr, user?.country)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Card>
              )}

              {DONATIONS_ENABLED ? (
                <>
                  <FilledButton
                    testID="success-donate"
                    label={busy ? "Sealing..." : "Donate & Continue ✦"}
                    onPress={submitDonation}
                    disabled={busy || !selectedTierInr}
                    style={{ marginTop: 20 }}
                  />
                  <GhostButton
                    testID="success-skip-donation"
                    label="Skip donation"
                    onPress={skipDonation}
                    style={{ marginTop: 10 }}
                  />
                </>
              ) : (
                <FilledButton
                  testID="success-skip-donation"
                  label={busy ? "Sealing..." : "Continue ✦"}
                  onPress={skipDonation}
                  disabled={busy}
                  style={{ marginTop: 20 }}
                />
              )}
            </>
          )}

          {step === "share" && (
            <>
              <Text style={styles.label}>YOUR ACHIEVEMENT CARD</Text>
              {Platform.OS === "web" ? (
                <View ref={cardWebRef} collapsable={false} style={{ width: "100%" }}>
                  <AchievementCard
                    goalLabel={manifestation?.goal_category === "custom" ? (manifestation?.goal_custom || "My Goal") : (goal?.label || "My Goal")}
                    goalEmoji={goal?.emoji}
                    deityName={deity.name}
                    deityColor={deity.color}
                    deityGlow={deity.glow}
                    cycleDays={manifestation?.cycle_days ?? 0}
                    streakCount={manifestation?.streak_count ?? 0}
                    achievedDateLabel={achievedDateLabel}
                    testimony={testimony}
                  />
                </View>
              ) : (
                <ViewShot ref={viewShotRef} style={{ width: "100%" }} options={{ format: "png", quality: 0.95 }}>
                  <AchievementCard
                    goalLabel={manifestation?.goal_category === "custom" ? (manifestation?.goal_custom || "My Goal") : (goal?.label || "My Goal")}
                    goalEmoji={goal?.emoji}
                    deityName={deity.name}
                    deityColor={deity.color}
                    deityGlow={deity.glow}
                    cycleDays={manifestation?.cycle_days ?? 0}
                    streakCount={manifestation?.streak_count ?? 0}
                    achievedDateLabel={achievedDateLabel}
                    testimony={testimony}
                  />
                </ViewShot>
              )}

              <FilledButton
                testID="success-share-image"
                label={sharingImage ? "Preparing image..." : "Share Achievement Image ✦"}
                onPress={shareAchievementImage}
                disabled={sharingImage}
                style={{ marginTop: 20 }}
              />
              {!!shareBanner && (
                <View style={styles.shareBanner} testID="success-share-banner">
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={styles.shareBannerText}>{shareBanner}</Text>
                </View>
              )}
              <GhostButton
                testID="success-skip-share"
                label="Skip sharing"
                onPress={finishAndGo}
                style={{ marginTop: 10 }}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  const bg = done ? COLORS.success : active ? COLORS.gold : COLORS.gray3;
  return (
    <View style={{ alignItems: "center" }}>
      <View style={[styles.dotWrap, { backgroundColor: bg + "20", borderColor: bg }]}>
        {done ? (
          <Ionicons name="checkmark" size={14} color={COLORS.success} />
        ) : (
          <View style={[styles.dotInner, { backgroundColor: bg }]} />
        )}
      </View>
      <Text style={[styles.stepLabel, { color: active || done ? COLORS.white : COLORS.gray2 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  stoneWrap: { alignItems: "center", marginTop: 20 },
  title: { color: COLORS.gold, fontSize: 40, fontWeight: "900", textAlign: "center", marginTop: 20 },
  sub: { color: COLORS.gray1, fontSize: 14, textAlign: "center", marginTop: 8 },

  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 24 },
  stepLine: { flex: 0, width: 40, height: 2, backgroundColor: COLORS.gray3, marginHorizontal: 12, marginBottom: 20 },
  dotWrap: { width: 28, height: 28, borderRadius: 999, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dotInner: { width: 8, height: 8, borderRadius: 999 },
  stepLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 6 },

  label: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 24, marginBottom: 8 },
  input: {
    height: 56, borderRadius: 16, backgroundColor: COLORS.surface1,
    color: COLORS.white, fontSize: 15, paddingHorizontal: 18, paddingVertical: 12,
  },
  donateTitle: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  donateSub: { color: COLORS.gray1, fontSize: 13, marginTop: 4 },
  tierGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  tierChip: {
    flexBasis: "31%", flexGrow: 1, height: 52, borderRadius: 14,
    backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "transparent",
  },
  tierChipActive: { backgroundColor: COLORS.gold + "22", borderColor: COLORS.gold },
  tierChipText: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  tierChipTextActive: { color: COLORS.gold },
  shareTitle: { color: COLORS.white, fontSize: 22, fontWeight: "900", marginTop: 12 },
  shareDesc: { color: COLORS.gray1, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 22 },
  shareBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: COLORS.success + "18", borderWidth: 1, borderColor: COLORS.success + "40",
  },
  shareBannerText: { color: COLORS.success, fontSize: 12, fontWeight: "700" },
});
