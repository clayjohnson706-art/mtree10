import React, { useEffect, useRef } from "react";
import { View, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { COLORS } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { useAuth } from "@/src/context/AuthContext";
import { getNextRoute } from "@/src/utils/nextRoute";
import { isColdStartNavigationHandled } from "@/src/utils/coldStartNav";

export default function Splash() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 90 });
    opacity.value = withTiming(1, { duration: 600 });
    taglineOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (hasNavigatedRef.current) return; // one-shot: never re-arm a stale redirect later.
    const t = setTimeout(() => {
      if (hasNavigatedRef.current) return;
      // A cold-start notification tap (e.g. the daily ritual reminder) already pushed its own
      // screen on top of this one — router.replace() here would blindly swap THAT screen out
      // for Home a couple seconds after it appeared, since replace() acts on whatever is
      // currently focused, not specifically on this splash screen. Bail out and let the
      // notification-driven navigation stand.
      if (isColdStartNavigationHandled()) return;
      hasNavigatedRef.current = true;
      router.replace(getNextRoute(user) as any);
    }, 2200);
    return () => clearTimeout(t);
  }, [loading, user, router]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));

  return (
    <View style={styles.container} testID="splash-screen">
      <AnimatedBackground deityColor={COLORS.gold} />
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Image
          source={require("@/assets/images/gen_logo_a_constellation_v2_secondary.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.Text style={[styles.tagline, taglineStyle]}>Goal · Intention · Sacrifice</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.void, alignItems: "center", justifyContent: "center" },
  logoWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  // Icon-only mark (no "mTree" wordmark) — square source artwork (1066 x 1066), so width and
  // height are equal here, matching the same icon-only asset used for app.json's native splash.
  logo: { width: 128, height: 128 },
  tagline: {
    color: COLORS.gray1,
    fontSize: 12,
    letterSpacing: 3,
    marginTop: 24,
    textTransform: "uppercase",
  },
});
