import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/src/theme";

const { height: SCREEN_H } = Dimensions.get("window");

export type InfoSection = {
  label: string;
  body: string | React.ReactNode;
};

export function InfoModal({
  visible,
  onClose,
  title,
  subtitle,
  accent = COLORS.gold,
  icon,
  sections,
  hero,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accent?: string;
  icon?: React.ReactNode;
  sections: InfoSection[];
  hero?: React.ReactNode;
  testID?: string;
}) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} testID={testID}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet} testID={`${testID}-sheet`}>
          <LinearGradient
            colors={[accent + "18", COLORS.surface1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={styles.header}>
            <View style={styles.handle} />
            <TouchableOpacity
              testID={`${testID}-close`}
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={16}
            >
              <Ionicons name="close" size={22} color={COLORS.white} />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroWrap}>
              {hero ? hero : icon ? (
                <View style={[styles.iconCircle, { backgroundColor: accent + "22", shadowColor: accent }]}>
                  {icon}
                </View>
              ) : null}
              <Text style={[styles.title, { color: accent }]}>{title}</Text>
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            {sections.map((s, i) => (
              <View key={i} style={styles.section}>
                <Text style={styles.sectionLabel}>{s.label}</Text>
                {typeof s.body === "string" ? (
                  <Text style={styles.sectionBody}>{s.body}</Text>
                ) : (
                  s.body
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000E0" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: SCREEN_H * 0.85,
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.7, shadowRadius: 30, shadowOffset: { width: 0, height: -8 }, elevation: 24,
  },
  header: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: COLORS.gray3, marginBottom: 8 },
  closeBtn: {
    position: "absolute", top: 16, right: 16,
    width: 36, height: 36, borderRadius: 999,
    backgroundColor: COLORS.surface2,
    alignItems: "center", justifyContent: "center",
    zIndex: 5,
  },
  heroWrap: { alignItems: "center", marginTop: 8, marginBottom: 20 },
  iconCircle: {
    width: 84, height: 84, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 10,
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "900", letterSpacing: 2, textAlign: "center", fontStyle: "italic" },
  subtitle: { color: COLORS.gray1, fontSize: 13, marginTop: 6, textAlign: "center" },
  section: {
    marginTop: 14,
    backgroundColor: COLORS.surface2,
    borderRadius: 18,
    padding: 18,
  },
  sectionLabel: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 10 },
  sectionBody: { color: COLORS.white, fontSize: 15, lineHeight: 24, fontWeight: "400" },
});
