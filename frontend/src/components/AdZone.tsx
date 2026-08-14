import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { useAppConfig } from "@/src/context/AppConfigContext";

export function AdZone({ placement }: { placement:"settings_banner"|"community_banner" }) {
  const { user }=useAuth(); const config=useAppConfig();
  if(!config.ads_enabled||user?.is_premium)return null;
  return <View testID={`ad-zone-${placement}`} style={styles.zone}><Ionicons name="megaphone-outline" size={16} color={COLORS.gray2}/><Text style={styles.text}>Sponsored placement</Text></View>;
}

export async function maybeShowInterstitial(_placement:"journey_complete"|"streak_complete"|"detail_closed") { return { shown:false, reason:"provider_not_activated" as const }; }
export async function requestRewardedAd(_reward:"bonus_affirmation"|"streak_grace") { return { rewarded:false, reason:"provider_not_activated" as const }; }
const styles=StyleSheet.create({zone:{minHeight:58,borderRadius:14,borderWidth:1,borderStyle:"dashed",borderColor:COLORS.gray3,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,marginVertical:16},text:{color:COLORS.gray2,fontSize:11.5,fontWeight:"700",letterSpacing:.5}});