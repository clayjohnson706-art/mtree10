import React, { useEffect } from "react";
import { View, StyleSheet, Pressable, Text, Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { COLORS } from "@/src/theme";
import RequireAuth from "@/src/components/RequireAuth";

const TAB_META: Record<string, { label: string; on: string; off: string }> = {
  home: { label: "Home", on: "flame", off: "flame-outline" },
  ritual: { label: "Ritual", on: "sparkles", off: "sparkles-outline" },
  wall: { label: "Community", on: "grid", off: "grid-outline" },
  me: { label: "Me", on: "person", off: "person-outline" },
};

function TabButton({ route, isFocused, onPress }: { route: any; isFocused: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(isFocused ? 1 : 0);
  useEffect(() => {
    glow.value = withTiming(isFocused ? 1 : 0, { duration: 220 });
    if (isFocused) {
      scale.value = withSpring(1.08, { damping: 12, stiffness: 220 });
    } else {
      scale.value = withSpring(1, { damping: 14, stiffness: 220 });
    }
  }, [isFocused, glow, scale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const meta = TAB_META[route.name] || TAB_META.home;

  return (
    <Pressable
      testID={`tab-${route.name}`}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={styles.tab}
    >
      <Animated.View pointerEvents="none" style={[styles.activeGlow, glowStyle]} />
      <Animated.View style={iconStyle}>
        <Ionicons
          name={(isFocused ? meta.on : meta.off) as any}
          size={23}
          color={isFocused ? COLORS.gold : COLORS.gray1}
        />
      </Animated.View>
      <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]} numberOfLines={1}>
        {meta.label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, navigation }: any) {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.wrap} pointerEvents="box-none">
      <View style={styles.pillShadow}>
        <BlurView intensity={40} tint="dark" style={styles.pill}>
          {state.routes.map((route: any, idx: number) => (
            <TabButton
              key={route.key}
              route={route}
              isFocused={state.index === idx}
              onPress={() => { if (state.index !== idx) navigation.navigate(route.name); }}
            />
          ))}
        </BlurView>
      </View>
    </SafeAreaView>
  );
}

export default function TabsLayout() {
  return (
    // Authenticated screens (Home/Wall/Ritual/Me and everything reachable from them) must never
    // be reachable without a valid, confirmed session — this closes the render-before-redirect
    // gap instead of relying purely on AuthNavGuard's effect timing.
    <RequireAuth>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: COLORS.void } }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="ritual" />
        <Tabs.Screen name="wall" />
        <Tabs.Screen name="me" />
      </Tabs>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingBottom: 10 },
  pillShadow: {
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  pill: {
    width: 316,
    height: 66,
    borderRadius: 999,
    // Translucent base under the blur guarantees contrast even where blur is unsupported.
    backgroundColor: "rgba(15, 15, 26, 0.82)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: COLORS.gold + "26",
    overflow: "hidden",
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", height: "100%", gap: 3 },
  activeGlow: {
    position: "absolute",
    top: 8,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.gold + "16",
  },
  tabLabel: { color: COLORS.gray2, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.4 },
  tabLabelActive: { color: COLORS.gold },
});
