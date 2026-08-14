import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/src/theme";
import { Card } from "@/src/components/ui";

export default function SacredCommitmentCard({ burningDesire, affirmation, sacrifice, testID="sacred-commitment-card", compact=false }: { burningDesire?:string|null; affirmation?:string|null; sacrifice?:string|null; testID?:string; compact?:boolean }) {
  const rows=[{key:"burning-desire",label:"BURNING DESIRE",icon:"heart",value:burningDesire||"Hold your deepest reason clearly in your heart."},{key:"affirmation",label:"AFFIRMATION",icon:"sparkles",value:affirmation||"My intention is clear and my disciplined actions support it."},{key:"sacrifice",label:"SACRIFICE",icon:"flame",value:sacrifice||"Honor the sacrifice you chose for this journey."}] as const;
  return <Card testID={testID} style={[styles.card,compact&&styles.compact]}><LinearGradient colors={[COLORS.gold+"20",COLORS.surface1]} style={StyleSheet.absoluteFillObject}/><View style={styles.headingRow}><Ionicons name="diamond-outline" size={19} color={COLORS.gold}/><Text style={styles.heading}>Your Sacred Commitment</Text></View>{rows.map((row,index)=><View key={row.key} testID={`${testID}-${row.key}`} style={[styles.row,index>0&&styles.divider]}><View style={styles.labelRow}><Ionicons name={row.icon} size={14} color={COLORS.gold}/><Text style={styles.label}>{row.label}</Text></View><Text style={[styles.value,compact&&styles.compactValue]}>{row.value}</Text></View>)}</Card>;
}

const styles=StyleSheet.create({card:{padding:22,overflow:"hidden",borderWidth:1,borderColor:COLORS.gold+"45"},compact:{padding:18},headingRow:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:4},heading:{color:COLORS.white,fontSize:20,fontWeight:"900"},row:{paddingVertical:15},divider:{borderTopWidth:1,borderTopColor:COLORS.gray3},labelRow:{flexDirection:"row",alignItems:"center",gap:7},label:{color:COLORS.gray1,fontSize:10.5,fontWeight:"900",letterSpacing:1.6},value:{color:COLORS.gold,fontSize:21,fontWeight:"900",lineHeight:29,marginTop:8},compactValue:{fontSize:18,lineHeight:25}});