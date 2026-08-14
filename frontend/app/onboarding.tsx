import React, { useCallback, useRef, useState } from "react";
import { BackHandler, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import { FilledButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";

const SLIDES = [
  { icon:"shield-checkmark-outline", color:COLORS.gold, title:"Manifestation, Grounded", body:"Manifestation is subjective. mTree does not promise supernatural outcomes — it helps you become more punctual, consistent, disciplined, and intentional so your daily actions can better support the future you want.", why:"Your progress comes from the choices and effort you practice each day.", disclaimer:true },
  { icon:"locate-outline", color:COLORS.gold, title:"Choose Your Goal", body:"A specific goal gives your attention a direction. You will return to it throughout the day so it can influence real choices, habits, and priorities.", why:"Clarity turns vague hope into an intention you can act on." },
  { icon:"flame-outline", color:COLORS.cyan, title:"Choose Your Sacrifice", body:"A sacrifice is a deliberate promise to release something that weakens your focus. It makes your commitment visible in everyday behavior.", why:"What you stop doing creates space for what matters." },
  { icon:"heart-outline", color:COLORS.danger, title:"Name Your Burning Desire", body:"Describe the deepest reason your goal matters. These private words become the emotional center that reconnects you when motivation drops.", why:"Emotion gives discipline a personal reason to continue." },
  { icon:"sparkles-outline", color:"#A855F7", title:"Speak Your Affirmation", body:"Your affirmation is a focused statement repeated with attention. It trains you to notice aligned choices and return to a constructive mindset.", why:"Repetition helps your intention stay present." },
  { icon:"alarm-outline", color:COLORS.warning, title:"Anchor Wake & Sleep", body:"Wake-up and before-sleep affirmations frame the two most receptive moments of your day with alarm-style reminders reserved only for these rituals.", why:"Begin with purpose. End with faith and reflection." },
  { icon:"notifications-outline", color:COLORS.electric, title:"Stay Consistent", body:"Daily reminders gently return you to your commitment during active hours. You choose the frequency and can use random or custom timing.", why:"Consistency is more reliable than waiting to feel motivated." },
  { icon:"barbell-outline", color:COLORS.gold, title:"Link Your Hustle", body:"Connect your ordinary work and meaningful effort to your intention. The task stays practical; the purpose behind it becomes stronger.", why:"Daily action is where intention becomes progress." },
  { icon:"leaf-outline", color:COLORS.success, title:"Link Fasting", body:"Optional fasting can turn cravings into mindful cues to remember your promise, breathe, and choose discipline with care.", why:"A conscious pause can strengthen self-command." },
  { icon:"planet-outline", color:"#93C5FD", title:"Choose Your Guide", body:"Select the visual guiding force that will shape your journey's color, symbol, and atmosphere throughout mTree.", why:"A consistent symbol makes your ritual feel personal and memorable." },
] as const;

export default function Onboarding() {
  const router=useRouter(); const { updateProfile }=useAuth(); const { width }=useWindowDimensions();
  const ref=useRef<ScrollView>(null); const indexRef=useRef(0); const [index,setIndex]=useState(0); const [understood,setUnderstood]=useState(false); const [busy,setBusy]=useState(false);
  indexRef.current=index;
  useFocusEffect(useCallback(()=>{const sub=BackHandler.addEventListener("hardwareBackPress",()=>{if(indexRef.current>0){ref.current?.scrollTo({x:(indexRef.current-1)*width,animated:true});return true;}return true;});return()=>sub.remove();},[width]));
  const next=async()=>{if(index===0&&!understood)return;if(index<SLIDES.length-1){ref.current?.scrollTo({x:(index+1)*width,animated:true});return;}setBusy(true);try{await updateProfile({onboarding_done:true});router.replace("/profile-setup");}finally{setBusy(false)}};
  const onScroll=(event:NativeSyntheticEvent<NativeScrollEvent>)=>{const nextIndex=Math.round(event.nativeEvent.contentOffset.x/width);if(nextIndex!==index)setIndex(nextIndex)};
  return <View style={styles.container} testID="onboarding-screen"><AnimatedBackground deityColor={SLIDES[index].color}/><SafeAreaView style={styles.safe} edges={["top","bottom"]}>
    <View style={styles.header}><Text style={styles.stepLabel}>FOUNDATION {index+1} / {SLIDES.length}</Text></View>
    <ScrollView ref={ref} horizontal pagingEnabled bounces={false} showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} style={{flex:1}}>
      {SLIDES.map((slide,i)=><View key={slide.title} style={[styles.slide,{width}]} testID={`onboarding-slide-${i}`}><View style={[styles.iconWrap,{borderColor:slide.color+"77",backgroundColor:slide.color+"15"}]}><Ionicons name={slide.icon as any} size={58} color={slide.color}/></View><Text style={styles.title}>{slide.title}</Text><Text style={styles.body}>{slide.body}</Text><View style={styles.whyCard}><Ionicons name="key-outline" size={18} color={slide.color}/><Text style={styles.whyText}>{slide.why}</Text></View>{slide.disclaimer&&<TouchableOpacity testID="disclaimer-understand-checkbox" style={[styles.checkboxRow,understood&&styles.checkboxActive]} onPress={()=>setUnderstood(!understood)} activeOpacity={.85}><Ionicons name={understood?"checkbox":"square-outline"} size={24} color={understood?COLORS.gold:COLORS.gray1}/><Text style={styles.checkboxText}>I understand</Text></TouchableOpacity>}</View>)}
    </ScrollView>
    <View style={styles.dots}>{SLIDES.map((_,i)=><View key={i} style={[styles.dot,i===index&&styles.dotActive]}/>)}</View>
    <View style={styles.footer}><FilledButton testID="onboarding-continue" label={busy?"Saving...":index===SLIDES.length-1?"Begin Setup":"Continue"} onPress={next} disabled={busy||(index===0&&!understood)}/>{index===0&&!understood&&<Text style={styles.hint}>Check “I understand” to continue</Text>}</View>
  </SafeAreaView></View>;
}

const styles=StyleSheet.create({container:{flex:1},safe:{flex:1},header:{paddingHorizontal:24,paddingTop:10},stepLabel:{color:COLORS.gray2,fontSize:11,fontWeight:"800",letterSpacing:1.8,textAlign:"center"},slide:{alignItems:"center",paddingHorizontal:30,paddingTop:34},iconWrap:{width:132,height:132,borderRadius:40,borderWidth:1.5,alignItems:"center",justifyContent:"center"},title:{color:COLORS.white,fontSize:30,fontWeight:"900",textAlign:"center",marginTop:30},body:{color:COLORS.gray1,fontSize:16,lineHeight:24,textAlign:"center",marginTop:16},whyCard:{flexDirection:"row",alignItems:"flex-start",gap:10,backgroundColor:COLORS.surface1,borderRadius:18,padding:16,marginTop:22},whyText:{color:COLORS.white,fontSize:14,fontWeight:"700",lineHeight:21,flex:1},checkboxRow:{minHeight:54,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10,borderRadius:16,borderWidth:1,borderColor:COLORS.gray3,alignSelf:"stretch",marginTop:18},checkboxActive:{borderColor:COLORS.gold,backgroundColor:COLORS.gold+"12"},checkboxText:{color:COLORS.white,fontSize:16,fontWeight:"800"},dots:{flexDirection:"row",justifyContent:"center",gap:6,marginVertical:16},dot:{width:6,height:6,borderRadius:3,backgroundColor:COLORS.gray3},dotActive:{width:22,backgroundColor:COLORS.gold},footer:{paddingHorizontal:24,paddingBottom:20},hint:{color:COLORS.gray2,fontSize:11.5,textAlign:"center",marginTop:8}});