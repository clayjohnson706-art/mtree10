import React from "react";
import Svg, { Path, Circle, Line, Polygon, G, Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { View, StyleSheet } from "react-native";
import { COLORS } from "@/src/theme";

// Each deity has a unique petroglyph-style symbol carved into stone.
// The stone is a rounded rect with texture; the symbol glows in deity color.

type DeitySymbolProps = { color: string; size?: number };

function ZorathSymbol({ color, size = 32 }: DeitySymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* spiral flame with 3 tips */}
      <Path d="M16 4 C 20 8, 22 12, 20 16 C 18 20, 14 18, 15 14 C 16 10, 20 12, 19 16 C 18 20, 14 22, 12 20"
        stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <Path d="M11 8 L 14 4 L 15 8 Z" fill={color} opacity={0.9} />
      <Path d="M22 6 L 24 2 L 25 6 Z" fill={color} opacity={0.9} />
      <Path d="M23 22 L 27 22 L 24 26 Z" fill={color} opacity={0.9} />
    </Svg>
  );
}
function KaelisSymbol({ color, size = 32 }: DeitySymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* infinity wave with central eye */}
      <Path d="M4 16 C 4 10, 12 10, 16 16 C 20 22, 28 22, 28 16 C 28 10, 20 10, 16 16 C 12 22, 4 22, 4 16 Z"
        stroke={color} strokeWidth="1.6" fill="none" />
      <Circle cx={16} cy={16} r={3.5} stroke={color} strokeWidth="1.5" fill="none" />
      <Circle cx={16} cy={16} r={1.2} fill={color} />
    </Svg>
  );
}
function TharunSymbol({ color, size = 32 }: DeitySymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* rooted triangle */}
      <Polygon points="16,5 6,24 26,24" stroke={color} strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      <Line x1="16" y1="24" x2="16" y2="30" stroke={color} strokeWidth="1.6" />
      <Line x1="16" y1="27" x2="11" y2="30" stroke={color} strokeWidth="1.4" />
      <Line x1="16" y1="27" x2="21" y2="30" stroke={color} strokeWidth="1.4" />
      <Line x1="16" y1="12" x2="12" y2="10" stroke={color} strokeWidth="1.2" />
      <Line x1="16" y1="12" x2="20" y2="10" stroke={color} strokeWidth="1.2" />
    </Svg>
  );
}
function VynelSymbol({ color, size = 32 }: DeitySymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* vortex spirals */}
      {[10, 7, 4].map((r, i) => (
        <Circle key={i} cx={16} cy={16} r={r} stroke={color} strokeWidth="1.4" fill="none" opacity={0.7 + i * 0.1} />
      ))}
      <Path d="M16 6 C 22 8, 25 14, 22 20 C 19 25, 12 24, 11 18" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </Svg>
  );
}
function AethisSymbol({ color, size = 32 }: DeitySymbolProps) {
  const cx = 16, cy = 16, r = 11;
  const points = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {points.map((p, i) => (
        <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={color} strokeWidth="1.4" />
      ))}
      <Circle cx={cx} cy={cy} r={2} fill={color} />
      {points.map((p, i) => (
        <Circle key={"c" + i} cx={p.x} cy={p.y} r={1.4} fill={color} />
      ))}
    </Svg>
  );
}
function SolmaraSymbol({ color, size = 32 }: DeitySymbolProps) {
  const cx = 16, cy = 16;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return {
      x1: cx + Math.cos(a) * 7,
      y1: cy + Math.sin(a) * 7,
      x2: cx + Math.cos(a) * 13,
      y2: cy + Math.sin(a) * 13,
    };
  });
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx={cx} cy={cy} r={5} stroke={color} strokeWidth="1.6" fill="none" />
      {rays.map((r, i) => (
        <Line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      ))}
      <Circle cx={cx} cy={cy} r={1.5} fill={color} />
    </Svg>
  );
}
function LunethSymbol({ color, size = 32 }: DeitySymbolProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M22 8 A 10 10 0 1 0 22 24 A 8 8 0 1 1 22 8 Z" stroke={color} strokeWidth="1.6" fill="none" />
      <Circle cx={19} cy={16} r={2.5} fill={color} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <Circle key={deg} cx={16 + Math.cos(a) * 14} cy={16 + Math.sin(a) * 14} r={0.9} fill={color} opacity={0.8} />
        );
      })}
    </Svg>
  );
}

const SYMBOLS: Record<string, React.FC<DeitySymbolProps>> = {
  Zorath: ZorathSymbol,
  Kaelis: KaelisSymbol,
  Tharun: TharunSymbol,
  Vynel: VynelSymbol,
  Aethis: AethisSymbol,
  Solmara: SolmaraSymbol,
  Luneth: LunethSymbol,
};

// The Stone tile: rough rounded rectangle with texture (fake via layered shadow + noise dots)
export function DeityStone({
  deityName,
  color,
  glow,
  size = 76,
  glowIntensity = 1,
  glowOn = true,
}: {
  deityName: string;
  color: string;
  glow?: string;
  size?: number;
  glowIntensity?: number;
  glowOn?: boolean;
}) {
  const Symbol = SYMBOLS[deityName] ?? ZorathSymbol;
  const stoneFill = "#1a1520";
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Outer glow */}
      {glowOn && (
        <View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size * 0.28,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6 * glowIntensity,
            shadowRadius: 18 * glowIntensity,
            elevation: 10,
          }}
        />
      )}
      {/* Stone base */}
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`stone-${deityName}`} cx="50%" cy="40%" r="70%">
            <Stop offset="0%" stopColor="#2a2338" />
            <Stop offset="70%" stopColor={stoneFill} />
            <Stop offset="100%" stopColor="#0a0812" />
          </RadialGradient>
        </Defs>
        <Rect x={6} y={8} width={88} height={84} rx={18} ry={20} fill={`url(#stone-${deityName})`} />
        {/* texture cracks */}
        <Path d="M12 30 L 22 42 L 18 55" stroke="#000" strokeWidth="1" fill="none" opacity={0.45} />
        <Path d="M85 25 L 78 40" stroke="#000" strokeWidth="1" fill="none" opacity={0.35} />
        <Path d="M15 80 L 30 78" stroke="#000" strokeWidth="1" fill="none" opacity={0.35} />
        <Path d="M78 82 L 88 74" stroke="#000" strokeWidth="1" fill="none" opacity={0.35} />
        {/* grain dots */}
        {Array.from({ length: 22 }).map((_, i) => (
          <Circle key={i} cx={10 + Math.random() * 80} cy={12 + Math.random() * 76} r={0.6} fill="#000" opacity={0.3} />
        ))}
      </Svg>
      {/* Symbol overlay */}
      <View style={{ position: "absolute" }}>
        <Symbol color={color} size={size * 0.5} />
      </View>
    </View>
  );
}

export default DeityStone;
