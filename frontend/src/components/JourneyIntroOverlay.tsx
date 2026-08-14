import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { COLORS } from "@/src/theme";
import { Card, FilledButton } from "@/src/components/ui";

const { width: SCREEN_W } = Dimensions.get("window");
const SLIDE_MS = 280;

// Shown as an overlay ON TOP of the Home screen EVERY time the user starts a NEW manifestation
// journey. Cards advance with a smooth HORIZONTAL SLIDE (no fade-only cuts).
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

// Indexes: 0..3 info cards, 4 = "Came True" importance card, 5 = final "You're Ready".
const CAME_TRUE_IDX = CARDS.length;
const FINAL_IDX = CARDS.length + 1;
const TOTAL = CARDS.length + 2;

export default function JourneyIntroOverlay({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const slideX = useSharedValue(0);

  const isFinal = idx === FINAL_IDX;

  const finish = () => {
    setIdx(0);
    onDone();
  };

  const showNext = (next: number) => {
    setIdx(next);
    // New card enters from the right and settles — a clean horizontal slide.
    slideX.value = SCREEN_W * 0.55;
    slideX.value = withTiming(0, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) });
  };

  const goNext = () => {
    if (isFinal) { finish(); return; }
    const next = idx + 1;
    // Current card slides out to the LEFT, then the next slides in from the RIGHT.
    slideX.value = withTiming(-SCREEN_W * 0.55, { duration: SLIDE_MS * 0.6, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(showNext)(next);
    });
  };

  const cardSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: 1 - Math.min(1, Math.abs(slideX.value) / (SCREEN_W * 0.55)) * 0.7,
  }));

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.container} testID="journey-intro-screen">
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.center}>
            <Animated.View style={[styles.cardWrap, cardSlideStyle]} testID={`journey-intro-card-${idx}`}>
              <Card style={styles.card}>
                {idx < CARDS.length ? (
                  <>
                    <View style={[styles.badge, { borderColor: CARDS[idx].color + "55", backgroundColor: CARDS[idx].color + "14" }]}>
                      <Text style={styles.badgeEmoji}>{CARDS[idx].emoji}</Text>
                    </View>
                    <Text style={styles.title}>{CARDS[idx].title}</Text>
                    <Text style={styles.body}>{CARDS[idx].body}</Text>
                  </>
                ) : idx === CAME_TRUE_IDX ? (
                  // "Came True" importance card — explains WHY the button matters, WHEN to use
                  // it, and shows a visual replica so the user recognises it instantly on Home.
                  <View style={{ alignItems: "center" }} testID="journey-intro-came-true-card">
                    <View style={[styles.badge, { borderColor: COLORS.gold + "66", backgroundColor: COLORS.gold + "16" }]}>
                      <Text style={styles.badgeEmoji}>🏆</Text>
                    </View>
                    <Text style={styles.title}>The “Came True” Button</Text>
                    <Text style={styles.body}>
                      The day your manifestation becomes real is the most sacred moment of this
                      journey. When it happens, press and HOLD this golden button on your Home
                      screen to claim it — celebrate, share your success, and inspire others.
                    </Text>
                    {/* Visual replica of the real button (bottom-right of Home) */}
                    <View style={styles.cameTrueMock} testID="journey-intro-came-true-visual">
                      <Text style={styles.cameTrueMockText}>✦ Came True</Text>
                    </View>
                    <View style={styles.cameTrueHintRow}>
                      <Ionicons name="finger-print" size={15} color={COLORS.gold} />
                      <Text style={styles.cameTrueHint}>
                        Hold — this moment deserves your full intention, never an accidental tap.
                      </Text>
                    </View>
                    <Text style={styles.holdCaption}>You&apos;ll find it at the bottom of your Home screen</Text>
                  </View>
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
              {Array.from({ length: TOTAL }, (_, i) => (
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
  container: { flex: 1, backgroundColor: "rgba(3,2,10,0.8)" },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  cardWrap: { width: "100%", maxWidth: 360 },
  card: { alignItems: "center", justifyContent: "center", paddingVertical: 32, paddingHorizontal: 26, minHeight: 400 },
  badge: {
    width: 76, height: 76, borderRadius: 999, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", marginBottom: 18,
  },
  badgeEmoji: { fontSize: 34 },
  title: { color: COLORS.white, fontSize: 21, fontWeight: "900", textAlign: "center" },
  body: { color: COLORS.gray1, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 },
  cameTrueMock: {
    marginTop: 20, height: 56, borderRadius: 18, alignSelf: "stretch",
    alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.gold,
    shadowColor: COLORS.gold, shadowOpacity: 0.55, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  cameTrueMockText: { color: COLORS.void, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
  cameTrueHintRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14, paddingHorizontal: 4 },
  cameTrueHint: { color: COLORS.gold, fontSize: 12.5, lineHeight: 18, fontWeight: "700", flex: 1 },
  holdIllustration: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginTop: 22, minHeight: 52, borderRadius: 16, alignSelf: "stretch",
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: COLORS.surface2, borderWidth: 1.5, borderColor: COLORS.gold + "55",
  },
  holdIllustrationText: { color: COLORS.gold, fontSize: 13, fontWeight: "800", letterSpacing: 0.8, textAlign: "center", flexShrink: 1 },
  holdCaption: { color: COLORS.gray2, fontSize: 11.5, textAlign: "center", marginTop: 12 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.gray3 },
  dotActive: { backgroundColor: COLORS.gold, width: 20 },
  footer: { width: "100%", maxWidth: 360, marginTop: 22 },
});
