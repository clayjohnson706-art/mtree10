import React, { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, COUNTRIES, flagEmoji } from "@/src/theme";

type Props = {
  visible: boolean;
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
};

export default function CountryPicker({ visible, selected, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [query]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => setQuery("")}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID="country-picker-sheet">
          <View style={styles.header}>
            <Text style={styles.title}>Select Country</Text>
            <TouchableOpacity testID="country-picker-close" onPress={onClose} hitSlop={16}>
              <Ionicons name="close" size={22} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={COLORS.gray2} />
            <TextInput
              testID="country-picker-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Search countries..."
              placeholderTextColor={COLORS.gray2}
              style={styles.searchInput}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity testID="country-picker-search-clear" onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={16} color={COLORS.gray2} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            style={{ maxHeight: 400 }}
            contentContainerStyle={{ paddingBottom: 12, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText} testID="country-picker-empty">No countries match &quot;{query}&quot;</Text>
            }
            renderItem={({ item }) => {
              const active = selected === item.code;
              return (
                <TouchableOpacity
                  testID={`country-option-${item.code}`}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => onSelect(item.code)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.rowText, active && styles.rowTextActive]}>
                    {flagEmoji(item.code)}  {item.name}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={COLORS.gold} />}
                </TouchableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingBottom: 24,
    paddingHorizontal: 16,
    maxHeight: "80%",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: COLORS.white, fontSize: 17, fontWeight: "800" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surface2,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: { flex: 1, color: COLORS.white, fontSize: 14.5, height: 44 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 4,
    minHeight: 48,
  },
  rowActive: { backgroundColor: COLORS.gold + "18" },
  rowText: { color: COLORS.gray1, fontSize: 15, fontWeight: "600" },
  rowTextActive: { color: COLORS.gold, fontWeight: "800" },
  emptyText: { color: COLORS.gray2, fontSize: 13.5, textAlign: "center", paddingVertical: 20 },
});
