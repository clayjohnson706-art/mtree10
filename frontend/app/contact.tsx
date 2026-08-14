import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Pressable,
  Image, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, Linking, Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import RequireAuth from "@/src/components/RequireAuth";
import { Card, FilledButton } from "@/src/components/ui";
import { api } from "@/src/utils/api";

const { height: SCREEN_H } = Dimensions.get("window");
const MAX_ATTACHMENTS = 3;

type Attachment = { filename: string; mime_type: string; data_base64: string };
type Ticket = {
  id: string;
  subject: string;
  description: string;
  status: "open" | "replied" | "closed";
  admin_reply?: string | null;
  admin_replied_at?: string | null;
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
};
type NotificationItem = { id: string; ref_id?: string; is_read: boolean; type: string };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: COLORS.warning },
  replied: { label: "Replied", color: COLORS.success },
  closed: { label: "Closed", color: COLORS.gray2 },
};

// Permission handling per the app's contract: check current state before ever prompting,
// only ask contextually (right when the user taps Add Photo / Take Photo), and respect
// canAskAgain so a permanently-blocked permission always routes to Settings instead of
// silently re-asking forever.
type PermResult = "granted" | "denied" | "blocked";
async function ensureImagePermission(kind: "camera" | "library"): Promise<PermResult> {
  const getFn = kind === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
  const reqFn = kind === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
  const current = await getFn();
  if (current.status === "granted") return "granted";
  if (current.status === "denied" && current.canAskAgain === false) return "blocked";
  const req = await reqFn();
  if (req.status === "granted") return "granted";
  return req.canAskAgain === false ? "blocked" : "denied";
}

export default function Contact() {
  const router = useRouter();
  const { ticketId: ticketIdParam } = useLocalSearchParams<{ ticketId?: string }>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [permBlocked, setPermBlocked] = useState<null | "camera" | "library">(null);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const unreadTicketIds = useMemo(() => {
    const s = new Set<string>();
    notifications.forEach((n) => { if (!n.is_read && n.type === "ticket_reply" && n.ref_id) s.add(n.ref_id); });
    return s;
  }, [notifications]);

  const load = useCallback(async () => {
    try {
      const [t, n] = await Promise.all([
        api<Ticket[]>("/tickets"),
        api<NotificationItem[]>("/notifications").catch(() => []),
      ]);
      setTickets(t);
      setNotifications(n);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openTicketDetail = useCallback(async (ticketSummary: Ticket) => {
    setSelectedTicket(ticketSummary);
    setDetailLoading(true);
    try {
      const full = await api<Ticket>(`/tickets/${ticketSummary.id}`);
      setSelectedTicket(full);
      // Mark any unread "reply" notifications tied to this ticket as read.
      const unread = notifications.filter((n) => !n.is_read && n.ref_id === ticketSummary.id);
      if (unread.length) {
        await Promise.all(unread.map((n) => api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {})));
        setNotifications((prev) => prev.map((n) => (n.ref_id === ticketSummary.id ? { ...n, is_read: true } : n)));
      }
    } catch {} finally {
      setDetailLoading(false);
    }
  }, [notifications]);

  // Deep-link from the notifications bell (Me tab) — auto-open the referenced ticket once
  // the list has loaded.
  useEffect(() => {
    if (!ticketIdParam || loading) return;
    const t = tickets.find((x) => x.id === ticketIdParam);
    if (t) {
      openTicketDetail(t);
      router.setParams({ ticketId: undefined });
    }
  }, [ticketIdParam, loading, tickets]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const resetForm = () => {
    setSubject(""); setDescription(""); setAttachments([]); setFormError(""); setPermBlocked(null);
  };

  const pickImage = async (kind: "camera" | "library") => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      setFormError(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
      return;
    }
    const perm = await ensureImagePermission(kind);
    if (perm === "blocked") { setPermBlocked(kind); return; }
    if (perm === "denied") {
      setFormError(kind === "camera" ? "Camera permission is needed to attach a photo." : "Photo library permission is needed to attach a photo.");
      return;
    }
    setPermBlocked(null);
    setFormError("");
    try {
      const result = kind === "camera"
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.5 });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || "image/jpeg";
      const ext = mime.split("/")[1] || "jpg";
      setAttachments((prev) => [...prev, {
        filename: `attachment_${prev.length + 1}.${ext}`,
        mime_type: mime,
        data_base64: asset.base64 as string,
      }]);
    } catch {
      setFormError("Couldn't attach that photo. Please try again.");
    }
  };

  const removeAttachment = (idx: number) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const submitTicket = async () => {
    const s = subject.trim();
    const d = description.trim();
    if (s.length < 3) { setFormError("Please enter a subject (at least 3 characters)."); return; }
    if (d.length < 10) { setFormError("Please describe your issue in a bit more detail."); return; }
    setSubmitting(true);
    setFormError("");
    try {
      await api("/tickets", { method: "POST", body: { subject: s, description: d, attachments } });
      setShowNewTicket(false);
      resetForm();
      await load();
    } catch {
      setFormError("Couldn't submit your ticket — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RequireAuth>
      <View style={styles.container} testID="contact-screen">
        <AnimatedBackground deityColor={COLORS.gold} />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} testID="contact-back">
              <Ionicons name="chevron-back" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.title}>Contact & Support</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
          >
            <Card style={{ marginBottom: 16, alignItems: "center", padding: 20 }} testID="contact-intro-card">
              <Ionicons name="chatbubble-ellipses" size={28} color={COLORS.gold} />
              <Text style={styles.introTitle}>Need help?</Text>
              <Text style={styles.introDesc}>Send us a ticket with a subject, description, and optional photo — we&apos;ll reply right here.</Text>
              <FilledButton
                testID="contact-new-ticket-btn"
                label="+ New Ticket"
                onPress={() => { resetForm(); setShowNewTicket(true); }}
                style={{ marginTop: 16, alignSelf: "stretch" }}
              />
            </Card>

            <Text style={styles.section}>MY TICKETS</Text>
            {loading ? (
              <ActivityIndicator color={COLORS.gold} style={{ marginTop: 20 }} testID="contact-loading" />
            ) : tickets.length === 0 ? (
              <Text style={styles.emptyText}>No tickets yet. Submit one above if you need help.</Text>
            ) : (
              tickets.map((t) => {
                const badge = STATUS_LABELS[t.status] || STATUS_LABELS.open;
                const hasUnread = unreadTicketIds.has(t.id);
                return (
                  <Card key={t.id} onPress={() => openTicketDetail(t)} testID={`ticket-row-${t.id}`} wrapperStyle={{ marginBottom: 10 }}>
                    <View style={styles.ticketRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {hasUnread && <View style={styles.unreadDot} testID={`ticket-unread-dot-${t.id}`} />}
                          <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                        </View>
                        <Text style={styles.ticketDate} numberOfLines={1}>
                          {new Date(t.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: badge.color + "20" }]}>
                        <Text style={{ color: badge.color, fontSize: 11, fontWeight: "800" }}>{badge.label.toUpperCase()}</Text>
                      </View>
                    </View>
                  </Card>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>

        {/* New Ticket form */}
        <Modal transparent visible={showNewTicket} animationType="slide" onRequestClose={() => setShowNewTicket(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalOverlay}>
              <Pressable style={styles.modalBackdrop} onPress={() => setShowNewTicket(false)} />
              <View style={styles.formSheet} testID="new-ticket-sheet">
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetHandle} />
                  <TouchableOpacity testID="new-ticket-close" onPress={() => setShowNewTicket(false)} style={styles.modalClose} hitSlop={16}>
                    <Ionicons name="close" size={22} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
                  <Text style={styles.formTitle}>New Support Ticket</Text>

                  <Text style={styles.fieldLabel}>SUBJECT</Text>
                  <TextInput
                    testID="new-ticket-subject"
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="Briefly describe the issue"
                    placeholderTextColor={COLORS.gray2}
                    style={styles.input}
                    maxLength={200}
                  />

                  <Text style={styles.fieldLabel}>DESCRIPTION</Text>
                  <TextInput
                    testID="new-ticket-description"
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Tell us what's happening in detail..."
                    placeholderTextColor={COLORS.gray2}
                    style={[styles.input, { height: 120, textAlignVertical: "top" }]}
                    multiline
                    maxLength={5000}
                  />

                  <Text style={styles.fieldLabel}>ATTACHMENTS ({attachments.length}/{MAX_ATTACHMENTS})</Text>
                  {attachments.length > 0 && (
                    <View style={styles.attachRow}>
                      {attachments.map((a, i) => (
                        <View key={i} style={styles.attachThumbWrap}>
                          <Image source={{ uri: `data:${a.mime_type};base64,${a.data_base64}` }} style={styles.attachThumb} />
                          <TouchableOpacity
                            testID={`remove-attachment-${i}`}
                            onPress={() => removeAttachment(i)}
                            style={styles.attachRemoveBtn}
                            hitSlop={8}
                          >
                            <Ionicons name="close" size={12} color={COLORS.white} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  {attachments.length < MAX_ATTACHMENTS && (
                    <View style={styles.attachActionsRow}>
                      <TouchableOpacity testID="new-ticket-take-photo" onPress={() => pickImage("camera")} style={styles.attachActionBtn} activeOpacity={0.85}>
                        <Ionicons name="camera-outline" size={18} color={COLORS.gold} />
                        <Text style={styles.attachActionText}>Take Photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity testID="new-ticket-choose-gallery" onPress={() => pickImage("library")} style={styles.attachActionBtn} activeOpacity={0.85}>
                        <Ionicons name="image-outline" size={18} color={COLORS.gold} />
                        <Text style={styles.attachActionText}>Choose from Gallery</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {permBlocked && (
                    <View style={styles.permBanner} testID="ticket-perm-blocked-banner">
                      <Ionicons name="lock-closed-outline" size={16} color={COLORS.warning} />
                      <Text style={styles.permBannerText}>
                        {permBlocked === "camera" ? "Camera" : "Photo library"} access is off in your device settings.
                      </Text>
                      <TouchableOpacity testID="ticket-perm-open-settings" onPress={() => Linking.openSettings()} style={styles.permBannerBtn}>
                        <Text style={styles.permBannerBtnText}>Open Settings</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {!!formError && <Text style={styles.formError} testID="new-ticket-error">{formError}</Text>}

                  <FilledButton
                    testID="new-ticket-submit"
                    label={submitting ? "Submitting..." : "Submit Ticket"}
                    onPress={submitTicket}
                    disabled={submitting}
                    style={{ marginTop: 20, alignSelf: "stretch" }}
                  />
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Ticket detail */}
        <Modal transparent visible={!!selectedTicket} animationType="slide" onRequestClose={() => setSelectedTicket(null)}>
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={() => setSelectedTicket(null)} />
            <View style={styles.detailSheet} testID="ticket-detail-sheet">
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHandle} />
                <TouchableOpacity testID="ticket-detail-close" onPress={() => setSelectedTicket(null)} style={styles.modalClose} hitSlop={16}>
                  <Ionicons name="close" size={22} color={COLORS.white} />
                </TouchableOpacity>
              </View>
              {selectedTicket && (
                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}>
                  <View style={styles.detailTopRow}>
                    <Text style={styles.formTitle}>{selectedTicket.subject}</Text>
                    <View style={[styles.statusPill, { backgroundColor: (STATUS_LABELS[selectedTicket.status] || STATUS_LABELS.open).color + "20" }]}>
                      <Text style={{ color: (STATUS_LABELS[selectedTicket.status] || STATUS_LABELS.open).color, fontSize: 11, fontWeight: "800" }}>
                        {(STATUS_LABELS[selectedTicket.status] || STATUS_LABELS.open).label.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.detailDate}>
                    Submitted {new Date(selectedTicket.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                  </Text>
                  <Text style={styles.detailDescription}>{selectedTicket.description}</Text>

                  {detailLoading ? (
                    <ActivityIndicator color={COLORS.gold} style={{ marginTop: 16 }} />
                  ) : (
                    <>
                      {!!selectedTicket.attachments?.length && (
                        <View style={styles.attachRow}>
                          {selectedTicket.attachments.map((a, i) => (
                            <Image key={i} source={{ uri: `data:${a.mime_type};base64,${a.data_base64}` }} style={styles.attachThumbLarge} />
                          ))}
                        </View>
                      )}
                      {selectedTicket.admin_reply ? (
                        <View style={styles.replyBox} testID="ticket-admin-reply-box">
                          <Text style={styles.replyLabel}>SUPPORT REPLY</Text>
                          <Text style={styles.replyText}>{selectedTicket.admin_reply}</Text>
                          {selectedTicket.admin_replied_at && (
                            <Text style={styles.detailDate}>
                              {new Date(selectedTicket.admin_replied_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                            </Text>
                          )}
                        </View>
                      ) : (
                        <View style={styles.pendingBox}>
                          <Ionicons name="time-outline" size={16} color={COLORS.gray2} />
                          <Text style={styles.pendingText}>Awaiting a reply from support.</Text>
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { color: COLORS.white, fontSize: 20, fontWeight: "800" },
  introTitle: { color: COLORS.white, fontSize: 16, fontWeight: "800", marginTop: 10 },
  introDesc: { color: COLORS.gray2, fontSize: 12.5, textAlign: "center", marginTop: 6, lineHeight: 18 },
  section: { color: COLORS.gray2, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 10 },
  emptyText: { color: COLORS.gray2, fontSize: 13, textAlign: "center", marginTop: 20 },

  ticketRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ticketSubject: { color: COLORS.white, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  ticketDate: { color: COLORS.gray2, fontSize: 11.5, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginLeft: 10 },

  modalOverlay: { flex: 1 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000E0" },
  formSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    maxHeight: SCREEN_H * 0.9,
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden",
  },
  detailSheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: SCREEN_H * 0.85,
    backgroundColor: COLORS.surface1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden",
  },
  sheetHeader: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: COLORS.gray3, marginBottom: 8 },
  modalClose: { position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: 999, backgroundColor: COLORS.surface2, alignItems: "center", justifyContent: "center" },
  formTitle: { color: COLORS.white, fontSize: 19, fontWeight: "800", flex: 1, marginTop: 8 },
  fieldLabel: { color: COLORS.gray2, fontSize: 10.5, fontWeight: "700", letterSpacing: 1.5, marginTop: 18, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.white, fontSize: 14, borderWidth: 1, borderColor: COLORS.gray3,
  },
  attachRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  attachThumbWrap: { position: "relative" },
  attachThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: COLORS.surface2 },
  attachThumbLarge: { width: 100, height: 100, borderRadius: 12, backgroundColor: COLORS.surface2 },
  attachRemoveBtn: {
    position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999,
    backgroundColor: COLORS.danger, alignItems: "center", justifyContent: "center",
  },
  attachActionsRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  attachActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 44, borderRadius: 12, backgroundColor: COLORS.gold + "18", borderWidth: 1, borderColor: COLORS.gold + "40",
  },
  attachActionText: { color: COLORS.gold, fontSize: 12.5, fontWeight: "700" },
  permBanner: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8,
    backgroundColor: COLORS.warning + "16", borderWidth: 1, borderColor: COLORS.warning + "40",
    borderRadius: 14, padding: 12, marginTop: 12,
  },
  permBannerText: { color: COLORS.gray1, fontSize: 12, lineHeight: 16, flex: 1, minWidth: 120 },
  permBannerBtn: { backgroundColor: COLORS.warning, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  permBannerBtnText: { color: COLORS.void, fontSize: 12, fontWeight: "800" },
  formError: { color: COLORS.danger, fontSize: 12.5, marginTop: 12, textAlign: "center" },

  detailTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  detailDate: { color: COLORS.gray2, fontSize: 11.5, marginTop: 4 },
  detailDescription: { color: COLORS.white, fontSize: 14, lineHeight: 21, marginTop: 16 },
  replyBox: { marginTop: 20, padding: 16, borderRadius: 16, backgroundColor: COLORS.success + "12" },
  replyLabel: { color: COLORS.success, fontSize: 10.5, fontWeight: "800", letterSpacing: 1.5 },
  replyText: { color: COLORS.white, fontSize: 14, lineHeight: 21, marginTop: 8 },
  pendingBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, padding: 14, borderRadius: 14, backgroundColor: COLORS.surface2 },
  pendingText: { color: COLORS.gray2, fontSize: 12.5 },
});
