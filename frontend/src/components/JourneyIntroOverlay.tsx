import React, { useState } from "react";
import { View, Text, StyleSheet, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, withTiming, useSharedValue } from "react-native-reanimated";
import { COLORS } from "@/src/theme";
import { Card, FilledButton } from "@/src/components/ui";

// Shown as an overlay ON TOP of the Home screen EVERY time the user starts a NEW manifestation
// journey (Goal, Sacrifice, Daily Commitment, Hustle, Fasting, etc. via manifest-setup) — a
// recurring reminder of their commitment before each new journey, not a one-time-only intro.
// The parent (Home) is responsible for only mounting/showing it right after that moment.
const CARDS = [
  {
    emoji: "🌱",
    color: COLORS.gold,
    title: "Your Journey Starts Now",
    body: "This is about commitment and discipline — becoming a better version of yourself. Progress comes from showing up every day, not from being perfect.",
  },
  {
    emoji: "🤝",
    color: COLORS.cyan,
    title: "Keep Your Promise",
    body: "The sacrifice you chose is part of your commitment. Don't cheat, and don't give up — even when it's difficult. Consistency matters more than motivation.",
  },
  {
    emoji: "🎯",
    color: COLORS.electric,
    title: "Stay On Track",
    body: "Keep your goal in mind every day, and stay true to your chosen sacrifice. Small, steady devotion becomes destiny.",
  },
  {
    emoji: "🔔",
    color: "#F5C542",
    title: "Never Miss a Moment",
    body: "If you tend to forget, set as many reminders as you need. Your mindset shapes your actions — and your actions shape your future.",
  },
];

export default function JourneyIntroOverlay({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const fade = useSharedValue(1);

  const isFinal = idx === CARDS.length;

  const finish = () => {
    setIdx(0);
    onDone();
  };

  const goNext = () => {
    if (!isFinal) {
      fade.value = 0;
      fade.value = withTiming(1, { duration: 220 });
      setIdx(idx + 1);
    } else {
      finish();
    }
  };

  const cardFadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      {/* Semi-transparent dark backdrop only — deliberately NO opaque background/starfield
          here, so the actual Home screen stays fully rendered and visible (dimmed) behind this
          overlay, instead of feeling like a separate full-screen page. */}
      <View style={styles.container} testID="journey-intro-screen">
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.center}>
            <Animated.View style={[styles.cardWrap, cardFadeStyle]} testID={`journey-intro-card-${idx}`}>
              <Card style={styles.card}>
                {!isFinal ? (
                  <>
                    <View style={[styles.badge, { borderColor: CARDS[idx].color + "55", backgroundColor: CARDS[idx].color + "14" }]}>
                      <Text style={styles.badgeEmoji}>{CARDS[idx].emoji}</Text>
                    </View>
                    <Text style={styles.title}>{CARDS[idx].title}</Text>
                    <Text style={styles.body}>{CARDS[idx].body}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.title}>You&apos;re Ready</Text>
                    <Text style={styles.body}>
                      Your journey is set — now it&apos;s time to take action. Close this and press the button below to begin your ritual.
                    </Text>
                    <View style={styles.holdIllustration} testID="journey-intro-hold-illustration">
                      <Ionicons name="finger-print" size={22} color={COLORS.gold} style={{ marginRight: 8 }} />
                      <Text style={styles.holdIllustrationText}>HOLD TO START</Text>
                    </View>
                    <Text style={styles.holdCaption}>↓ Press and hold that button on Home</Text>
                  </>
                )}
              </Card>
            </Animated.View>
            <View style={styles.dots}>
              {Array.from({ length: CARDS.length + 1 }, (_, i) => (
                <View key={i} style={[styles.dot, i === idx && styles.dotActive]} />
              ))}
            </View>
            <View style={styles.footer}>
              <FilledButton
                testID="journey-intro-continue"
                label={isFinal ? "Got It" : "Next"}
                onPress={goNext}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)" },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  cardWrap: { width: "100%", maxWidth: 360 },
  // Fixed minHeight so every card in the sequence (4 info cards + the final "You're Ready" card,
  // which has extra hold-illustration content) renders at the SAME size — previously each card's
  // height hugged its own content, so the final card was visibly taller/mismatched.
  card: { alignItems: "center", justifyContent: "center", paddingVertical: 32, paddingHorizontal: 26, minHeight: 380 },
  badge: {
    width: 76, height: 76, borderRadius: 999, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", marginBottom: 18,
  },
  badgeEmoji: { fontSize: 34 },
  title: { color: COLORS.white, fontSize: 21, fontWeight: "800", textAlign: "center" },
  body: { color: COLORS.gray1, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 12 },
  holdIllustration: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginTop: 22, minHeight: 52, borderRadius: 16, alignSelf: "stretch",
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: COLORS.surface2, borderWidth: 1.5, borderColor: COLORS.gold + "55",
  },
  holdIllustrationText: { color: COLORS.gold, fontSize: 13, fontWeight: "800", letterSpacing: 0.8, textAlign: "center", flexShrink: 1 },
  holdCaption: { color: COLORS.gray2, fontSize: 11.5, textAlign: "center", marginTop: 10 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gray3 },
  dotActive: { backgroundColor: COLORS.gold, width: 20 },
  footer: { width: "100%", maxWidth: 360, marginTop: 22 },
});
