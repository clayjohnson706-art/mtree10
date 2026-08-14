import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import RequireAuth from "@/src/components/RequireAuth";
import { Card, FilledButton } from "@/src/components/ui";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is a \"Manifestation\" in mTree?",
    a: "A Manifestation is one cycle of focused intention: a Goal you want, a Sacrifice you give up in return, a Deity that guides you, and a length (7/21/40/90 days). You complete one daily ritual to grow it.",
  },
  {
    q: "Why does every Goal need a Sacrifice?",
    a: "The core philosophy of mTree is that manifestation isn't passive wishing — it's an exchange. Giving something up (a habit, a distraction) proves commitment and keeps you honest about what you truly want.",
  },
  {
    q: "What does \"Hold to Manifest\" actually do?",
    a: "Holding the button for a few seconds each day is your daily ritual — it grows your streak, advances your tree stage, and (if enabled) walks you through your affirmation and sacrifice chant. It can only be completed once per calendar day.",
  },
  {
    q: "What happens if I miss a day?",
    a: "Missing a full day resets your current streak back to 1 on your next ritual — but your total days completed (current_day) and your Best Streak record are never lost. Every fresh start still counts toward your journey.",
  },
  {
    q: "What is \"Fasting Linked\"?",
    a: "An honor-based commitment you make alongside your manifestation. However you define your fast, it's not about restriction — it's a physical reminder of discipline that creates space for what you're inviting in.",
  },
  {
    q: "What is \"Hustle Linked\"?",
    a: "A mindset, not a task. Whenever you do meaningful work, you mentally dedicate that effort toward your goal — turning ordinary daily action into intentional progress, without changing what you actually do.",
  },
  {
    q: "How does the Daily Affirmation work?",
    a: "If enabled, you get a short affirmation (in your chosen language, or a custom one you write yourself) to chant 10 times in your mind during the ritual — reinforcing your intention daily.",
  },
  {
    q: "Can I change my Goal or Sacrifice mid-cycle?",
    a: "No — your Goal and Sacrifice are sealed for the current manifestation to protect your commitment. You can delete the current one (resetting progress) and start a fresh manifestation with new choices any time.",
  },
  {
    q: "What is Cosmic Energy / Moon Phase for?",
    a: "They're daily context, not requirements — a spiritual backdrop that reflects natural rhythms. Consistency (your streak) is what actually compounds your progress, cosmic energy just colors the mood of each day.",
  },
  {
    q: "What is the Community Wall?",
    a: "A premium feature showing manifestations others have completed — for inspiration, not comparison. You can save cards that resonate with you and see a leaderboard of the longest streaks.",
  },
  {
    q: "How do I change my Deity?",
    a: "From Settings → Deity → Change Deity. This is only available when you have no active manifestation — your Deity stays fixed for the duration of a manifestation, same as Goal and Sacrifice.",
  },
  {
    q: "Is my data private?",
    a: "Your manifestation is public on the Community Wall only when marked public (default on, toggle in Settings → Privacy) and only once completed. Your personal details (email, DOB) are never shown publicly.",
  },
];

function AccordionItem({ item, expanded, onToggle, testID }: { item: { q: string; a: string }; expanded: boolean; onToggle: () => void; testID: string }) {
  return (
    <Card style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.8} style={styles.faqHeader} testID={testID}>
        <Text style={styles.faqQ}>{item.q}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.gold} />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.faqBody} testID={`${testID}-body`}>
          <Text style={styles.faqA}>{item.a}</Text>
        </View>
      )}
    </Card>
  );
}

export default function Help() {
  const router = useRouter();
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <RequireAuth>
      <View style={styles.container} testID="help-screen">
        <AnimatedBackground deityColor={COLORS.gold} />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} testID="help-back">
              <Ionicons name="chevron-back" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.title}>Help &amp; FAQ</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text style={styles.intro}>
              Everything about how mTree&apos;s practice works. Still stuck? Reach out below.
            </Text>
            {FAQ.map((item, i) => (
              <AccordionItem
                key={item.q}
                item={item}
                expanded={expandedSet.has(i)}
                onToggle={() => toggle(i)}
                testID={`faq-item-${i}`}
              />
            ))}

            <Card style={{ marginTop: 16, alignItems: "center", padding: 22 }} testID="help-contact-card">
              <Ionicons name="chatbubble-ellipses-outline" size={30} color={COLORS.gold} />
              <Text style={styles.contactTitle}>Still need help?</Text>
              <Text style={styles.contactDesc}>Send us a ticket and we&apos;ll get back to you here in the app.</Text>
              <FilledButton
                testID="help-contact-us-btn"
                label="Contact Us"
                onPress={() => router.push("/contact")}
                style={{ marginTop: 16, alignSelf: "stretch" }}
              />
            </Card>
          </ScrollView>
        </SafeAreaView>
      </View>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "800" },
  intro: { color: COLORS.gray1, fontSize: 13, lineHeight: 20, marginBottom: 16 },
  faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, gap: 10 },
  faqQ: { color: COLORS.white, fontSize: 14, fontWeight: "700", flex: 1 },
  faqBody: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 0 },
  faqA: { color: COLORS.gray1, fontSize: 13, lineHeight: 20 },
  contactTitle: { color: COLORS.white, fontSize: 16, fontWeight: "800", marginTop: 10 },
  contactDesc: { color: COLORS.gray2, fontSize: 12.5, textAlign: "center", marginTop: 6, lineHeight: 18 },
});
