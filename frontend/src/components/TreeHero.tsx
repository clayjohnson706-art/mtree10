import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, Circle, Ellipse, G, Defs, LinearGradient as SvgLinearGradient, Stop, RadialGradient } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { COLORS } from "@/src/theme";

const AnimatedView = Animated.createAnimatedComponent(View);

// A stylized "3D-looking" Banyan tree rendered in SVG with volumetric shading
// and a 3-layer breathing deity aura outline.
// Stages 1..5 shrink/grow the tree accordingly.

function TreeSVG({ color, stage, size = 240 }: { color: string; stage: number; size?: number }) {
  const scale = 0.55 + stage * 0.09; // stages 1..5 → 0.64..1.0
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <SvgLinearGradient id="trunk" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor="#3a2a1a" />
          <Stop offset="50%" stopColor="#5a3f24" />
          <Stop offset="100%" stopColor="#2a1e12" />
        </SvgLinearGradient>
        <RadialGradient id="canopy" cx="50%" cy="40%" r="60%">
          <Stop offset="0%" stopColor="#3d5a34" />
          <Stop offset="70%" stopColor="#1e2f18" />
          <Stop offset="100%" stopColor="#0b170a" />
        </RadialGradient>
        <RadialGradient id="canopyLit" cx="65%" cy="30%" r="40%">
          <Stop offset="0%" stopColor="#6d8f4f" stopOpacity="0.9" />
          <Stop offset="100%" stopColor="#6d8f4f" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <G transform={`translate(100 180) scale(${scale}) translate(-100 -180)`}>
        {/* aerial roots hanging (only stage>=3) */}
        {stage >= 3 && (
          <>
            <Path d="M 70 100 Q 68 130, 72 165" stroke="#3a2a1a" strokeWidth={3} fill="none" strokeLinecap="round" />
            <Path d="M 130 100 Q 132 130, 128 165" stroke="#3a2a1a" strokeWidth={3} fill="none" strokeLinecap="round" />
            <Path d="M 85 105 Q 82 140, 88 170" stroke="#4a3222" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <Path d="M 115 105 Q 118 140, 112 170" stroke="#4a3222" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          </>
        )}
        {/* trunk */}
        <Path d="M 90 180 L 88 130 Q 90 120, 100 118 Q 110 120, 112 130 L 110 180 Z" fill="url(#trunk)" />
        {/* branches */}
        <Path d="M 92 130 Q 70 115, 55 100" stroke="#3a2a1a" strokeWidth={5} fill="none" strokeLinecap="round" />
        <Path d="M 108 130 Q 130 115, 145 100" stroke="#3a2a1a" strokeWidth={5} fill="none" strokeLinecap="round" />
        <Path d="M 100 120 Q 100 100, 100 85" stroke="#3a2a1a" strokeWidth={5} fill="none" strokeLinecap="round" />
        {/* canopy - multi-layered */}
        <Ellipse cx={100} cy={80} rx={70} ry={45} fill="url(#canopy)" />
        <Ellipse cx={70} cy={95} rx={35} ry={26} fill="url(#canopy)" opacity={0.9} />
        <Ellipse cx={130} cy={95} rx={35} ry={26} fill="url(#canopy)" opacity={0.9} />
        <Ellipse cx={100} cy={60} rx={45} ry={30} fill="url(#canopy)" />
        {/* highlight */}
        <Ellipse cx={115} cy={55} rx={38} ry={22} fill="url(#canopyLit)" />
        {/* tiny stars (celestial stage) */}
        {stage === 5 && (
          <>
            <Circle cx={95} cy={45} r={1.4} fill="#fff8d6" />
            <Circle cx={125} cy={70} r={1.2} fill="#fff8d6" />
            <Circle cx={75} cy={68} r={1.1} fill="#fff8d6" />
            <Circle cx={110} cy={90} r={1} fill="#fff8d6" />
          </>
        )}
        {/* ground */}
        <Ellipse cx={100} cy={182} rx={40} ry={4} fill="#000" opacity={0.5} />
      </G>
    </Svg>
  );
}

export default function TreeHero({
  color,
  stage = 1,
  size = 260,
  intensity = 1,
}: {
  color: string;
  stage?: number;
  size?: number;
  intensity?: number;
}) {
  const pulse1 = useSharedValue(0);
  const pulse2 = useSharedValue(0);
  const pulse3 = useSharedValue(0);

  useEffect(() => {
    pulse1.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }), -1, true);
    pulse2.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true);
    pulse3.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);

  const auraOuter = useAnimatedStyle(() => ({
    opacity: interpolate(pulse3.value, [0, 1], [0.06 * intensity, 0.12 * intensity]),
  }));
  const auraMid = useAnimatedStyle(() => ({
    opacity: interpolate(pulse2.value, [0, 1], [0.22 * intensity, 0.34 * intensity]),
  }));
  const auraEdge = useAnimatedStyle(() => ({
    opacity: interpolate(pulse1.value, [0, 1], [0.55 * intensity, 0.9 * intensity]),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Layer 3: Atmospheric — largest, softest */}
      <AnimatedView
        style={[
          styles.aura,
          { width: size * 1.4, height: size * 1.4, backgroundColor: color, borderRadius: size },
          auraOuter,
        ]}
      />
      {/* Layer 2: Inner bloom */}
      <AnimatedView
        style={[
          styles.aura,
          { width: size * 1.1, height: size * 1.1, backgroundColor: color, borderRadius: size },
          auraMid,
        ]}
      />
      {/* Layer 1: Edge glow (tight) */}
      <AnimatedView
        style={[
          styles.aura,
          {
            width: size * 0.86,
            height: size * 0.86,
            borderColor: color,
            borderWidth: 1.5,
            borderRadius: size,
            backgroundColor: "transparent",
            shadowColor: color,
            shadowRadius: 24,
            shadowOpacity: 0.8,
            shadowOffset: { width: 0, height: 0 },
          },
          auraEdge,
        ]}
      />
      <TreeSVG color={color} stage={stage} size={size * 0.85} />
    </View>
  );
}

const styles = StyleSheet.create({
  aura: {
    position: "absolute",
  },
});
