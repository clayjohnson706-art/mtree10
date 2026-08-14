import React, { useState } from "react";
import { View, Text, Image, StyleSheet, ActivityIndicator, Linking, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { FilledButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { getNextRoute } from "@/src/utils/nextRoute";
import { LEGAL_LINKS } from "@/src/utils/legalLinks";

export default function Auth() {
  const router = useRouter();
  const { signIn, user, loading, blockedMessage, clearBlockedMessage } = useAuth();
  const [signing, setSigning] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Go straight to the next onboarding step — never bounce back through the splash screen.
  React.useEffect(() => {
    if (!loading && user) {
      router.replace(getNextRoute(user) as any);
    }
  }, [loading, user]);

  async function handleSignIn() {
    if (!agreed) return;
    setSignInError(null);
    setSigning(true);
    try {
      await signIn();
    } catch (e: any) {
      // User-cancelled native sign-in is expected/silent; anything else surfaces a message —
      // includes the raw error detail (e.g. native error code) so a real sign-in failure on a
      // device/build is actually diagnosable instead of a purely generic message.
      const msg = String(e?.message || "");
      if (!msg.toLowerCase().includes("cancel")) {
        setSignInError(`Sign-in failed: ${msg || "please try again."}`);
      }
    } finally {
      setSigning(false);
    }
  }

  return (
    <View style={styles.container} testID="auth-screen">
      <AnimatedBackground deityColor={COLORS.gold} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.heroWrap}>
          <Image
            source={require("@/assets/images/gen_logo_a_constellation_v2_secondary.png")}
            style={styles.heroLogo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.bottom}>
          {!!blockedMessage && (
            <View style={styles.blockedBanner} testID="account-blocked-banner">
              <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.blockedBannerText}>{blockedMessage}</Text>
              <TouchableOpacity onPress={clearBlockedMessage} testID="account-blocked-banner-dismiss">
                <Ionicons name="close" size={16} color={COLORS.gray1} />
              </TouchableOpacity>
            </View>
          )}
          {!!signInError && (
            <View style={styles.blockedBanner} testID="google-signin-error-banner">
              <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.blockedBannerText}>{signInError}</Text>
              <TouchableOpacity onPress={() => setSignInError(null)} testID="google-signin-error-dismiss">
                <Ionicons name="close" size={16} color={COLORS.gray1} />
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.title}>Welcome to mTree</Text>
          <Text style={styles.subtitle}>
            Manifest your intentions through ancient ritual, sacred energy, and daily devotion.
          </Text>
          <View style={styles.checkboxRow}>
            <TouchableOpacity
              testID="terms-agree-checkbox"
              onPress={() => setAgreed((prev) => !prev)}
              style={[styles.checkboxBox, agreed && styles.checkboxBoxChecked]}
              activeOpacity={0.8}
            >
              {agreed && <Ionicons name="checkmark" size={14} color={COLORS.void} />}
            </TouchableOpacity>
            <Text
              style={styles.terms}
              onPress={() => setAgreed((prev) => !prev)}
            >
              I have read and agree to the{" "}
              <Text
                testID="terms-link"
                style={styles.termsLink}
                onPress={() => Linking.openURL(LEGAL_LINKS.termsAndConditions)}
              >
                Terms &amp; Conditions
              </Text>
              {", "}
              <Text
                testID="privacy-policy-link"
                style={styles.termsLink}
                onPress={() => Linking.openURL(LEGAL_LINKS.privacyPolicy)}
              >
                Privacy Policy
              </Text>
              {", and "}
              <Text
                testID="account-deletion-policy-link"
                style={styles.termsLink}
                onPress={() => Linking.openURL(LEGAL_LINKS.accountDeletion)}
              >
                Account Deletion Policy
              </Text>
              .
            </Text>
          </View>
          <FilledButton
            testID="google-signin-button"
            label={signing ? "Signing in..." : "Continue with Google"}
            onPress={handleSignIn}
            disabled={signing || !agreed}
            style={{
              backgroundColor: COLORS.white,
              marginTop: 20,
              opacity: !agreed ? 0.4 : 1,
            }}
          />
          {signing && <ActivityIndicator color={COLORS.gold} style={{ marginTop: 16 }} />}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.void },
  safe: { flex: 1, paddingHorizontal: 24 },
  heroWrap: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 24 },
  heroLogo: { width: 150, height: 150 },
  bottom: { paddingBottom: 32 },
  title: { color: COLORS.white, fontSize: 36, fontWeight: "800", letterSpacing: 0.3, marginBottom: 10 },
  subtitle: { color: COLORS.gray1, fontSize: 15, lineHeight: 22 },
  terms: { color: COLORS.gray2, fontSize: 11, flex: 1, lineHeight: 17 },
  termsLink: { color: COLORS.gold, textDecorationLine: "underline" },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10 },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: COLORS.gray2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  blockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.danger + "18",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  blockedBannerText: { color: COLORS.gray1, fontSize: 12.5, flex: 1, lineHeight: 17 },
});
