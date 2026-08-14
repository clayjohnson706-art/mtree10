import React from "react";
import { Image, View, StyleSheet } from "react-native";
import { COLORS } from "@/src/theme";

// Brand mark (icon only, no wordmark) — used in the Home header. Sits in a rounded
// card-style container matching the settings/bell buttons beside it for visual consistency.
export default function AppLogo({ size = 40 }: { size?: number }) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={require("@/assets/images/gen_logo_a_constellation_v2_secondary.png")}
        style={{ width: size * 0.66, height: size * 0.66 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface1,
  },
});
