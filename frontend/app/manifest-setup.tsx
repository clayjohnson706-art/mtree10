import React, { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, CYCLE_OPTIONS, GOAL_CATEGORIES, LANGUAGES, REMINDER_OPTIONS, SACRIFICE_CATEGORIES } from "@/src/theme";
import AnimatedBackground from "@/src/components/AnimatedBackground";
import LanguagePicker from "@/src/components/LanguagePicker";
import { Card, Chip, FilledButton } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/utils/api";
import { computeEvenReminderTimes, isReservedAlarmTime, rescheduleReminders, scheduleWakeSleepAlarms } from "@/src/utils/notifications";
import { getCosmicEnergy } from "@/src/utils/cosmic";
import { getSpiritualMoonDay } from "@/src/utils/spiritual-moon";

const STEPS = ["goal", "sacrifice", "burning", "affirmation", "alarms", "reminders", "hustle", "fasting", "confirm"] as const;
type PickerTarget = "wake" | "sleep" | number | null;

function toDate(value: string) { const d = new Date(); const [h, m] = value.split(":").map(Number); d.setHours(h, m, 0, 0); return d; }
function toTime(value: Date) { return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; }
function formatTime(value: string) { const [h, m] = value.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; }
function timeList(count: number, wake: string, sleep: string) {
  return computeEvenReminderTimes(count, null, null, wake, sleep).map((t) => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`);
}

export default function ManifestSetup() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [goalCat, setGoalCat] = useState<string | null>(null);
  const [goalCustom, setGoalCustom] = useState("");
  const [sacrificeCat, setSacrificeCat] = useState<string | null>(null);
  const [sacrificeCustom, setSacrificeCustom] = useState("");
  const [burningDesire, setBurningDesire] = useState("");
  const [affirmationOn, setAffirmationOn] = useState(true);
  const [affirmationCustom, setAffirmationCustom] = useState("");
  const [affirmationLanguage, setAffirmationLanguage] = useState(user?.affirmation_language || "english");
  const [showLanguages, setShowLanguages] = useState(false);
  const [wakeEnabled, setWakeEnabled] = useState(user?.wake_alarm_enabled !== false);
  const [sleepEnabled, setSleepEnabled] = useState(user?.sleep_alarm_enabled !== false);
  const [wakeTime, setWakeTime] = useState(user?.wake_alarm_time || "07:00");
  const [sleepTime, setSleepTime] = useState(user?.sleep_alarm_time || "22:00");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderCount, setReminderCount] = useState(user?.notification_count || 10);
  const [reminderMode, setReminderMode] = useState<"random" | "custom">((user?.reminder_mode as "random" | "custom") || "random");
  const [reminderTimes, setReminderTimes] = useState<string[]>(user?.reminder_times?.length ? user.reminder_times : timeList(10, wakeTime, sleepTime));
  const [cycleDays, setCycleDays] = useState(21);
  const [hustle, setHustle] = useState(false);
  const [fasting, setFasting] = useState(false);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [busy, setBusy] = useState(false);

  const current = STEPS[step];
  const canContinue = useMemo(() => {
    if (current === "goal") return !!goalCat && (goalCat !== "custom" || !!goalCustom.trim());
    if (current === "sacrifice") return !!sacrificeCat && (sacrificeCat !== "custom" || !!sacrificeCustom.trim());
    if (current === "burning") return burningDesire.trim().length >= 3;
    return true;
  }, [current, goalCat, goalCustom, sacrificeCat, sacrificeCustom, burningDesire]);

  const resizeReminderTimes = (count: number) => setReminderTimes((previous) => {
    const seed = timeList(count, wakeTime, sleepTime);
    return Array.from({ length: count }, (_, index) => previous[index] || seed[index]);
  });

  const applyTime = (value: string) => {
    if (picker === "wake") { setWakeTime(value); return; }
    if (picker === "sleep") { setSleepTime(value); return; }
    if (typeof picker === "number") {
      const reserved = isReservedAlarmTime(value, wakeTime, sleepTime);
      if (reserved) { Alert.alert("Reserved ritual time", `This time is reserved for your ${reserved} ritual`); return; }
      setReminderTimes((previous) => previous.map((time, index) => index === picker ? value : time));
    }
  };
  const pickerValue = picker === "wake" ? wakeTime : picker === "sleep" ? sleepTime : typeof picker === "number" ? reminderTimes[picker] : wakeTime;
  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setPicker(null);
    if (event.type === "set" && selected) applyTime(toTime(selected));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const count = remindersEnabled ? reminderCount : 0;
      const customTimes = reminderMode === "custom" ? reminderTimes.slice(0, count) : [];
      await api("/manifestations", { method: "POST", body: {
        goal_category: goalCat, goal_custom: goalCat === "custom" ? goalCustom.trim() : null,
        burning_desire: burningDesire.trim(), sacrifice_category: sacrificeCat,
        sacrifice_custom: sacrificeCat === "custom" ? sacrificeCustom.trim() : null,
        cycle_days: cycleDays, reminder_count: count, reminder_mode: reminderMode, reminder_times: customTimes,
        affirmation_enabled: affirmationOn, affirmation_custom: affirmationCustom.trim() || null,
        fasting_enabled: fasting, hustle_enabled: hustle, is_public: user?.is_public ?? true,
        cosmic_level_at_start: getCosmicEnergy(), moon_phase_at_start: getSpiritualMoonDay().name,
      }});
      await updateProfile({
        affirmation_language: affirmationLanguage, notification_count: count,
        reminder_mode: reminderMode, reminder_times: customTimes,
        wake_alarm_enabled: wakeEnabled, wake_alarm_time: wakeTime,
        sleep_alarm_enabled: sleepEnabled, sleep_alarm_time: sleepTime,
      });
      await Promise.all([
        scheduleWakeSleepAlarms(wakeEnabled, wakeTime, sleepEnabled, sleepTime),
        rescheduleReminders(count, null, null, reminderMode, customTimes, wakeTime, sleepTime),
      ]);
      if (!user?.deity_id) router.replace("/deity");
      else router.replace({ pathname: "/(tabs)/home", params: { showJourneyIntro: "1" } });
    } finally { setBusy(false); }
  };

  return <View style={styles.container} testID="manifest-setup">
    <AnimatedBackground deityColor={COLORS.gold} />
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <TouchableOpacity testID="setup-back" style={styles.back} onPress={() => step ? setStep(step - 1) : router.back()}><Ionicons name="chevron-back" size={20} color={COLORS.white}/><Text style={styles.backText}>Back</Text></TouchableOpacity>
          <View style={styles.progress}>{STEPS.map((_, i) => <View key={i} style={[styles.dot, i <= step && styles.dotActive]}/>)}</View><View style={{ width: 62 }}/>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {current === "goal" && <Step title="Choose Your Goal" why="A clear destination gives your discipline direction and meaning."><View style={styles.chips}>{GOAL_CATEGORIES.map((item) => <Chip key={item.key} testID={`goal-${item.key}`} label={item.label} emoji={item.emoji} selected={goalCat === item.key} onPress={() => setGoalCat(item.key)}/>)}</View>{goalCat === "custom" && <TextInput testID="goal-custom-input" style={styles.input} value={goalCustom} onChangeText={setGoalCustom} placeholder="Describe your goal" placeholderTextColor={COLORS.gray2}/>}</Step>}
          {current === "sacrifice" && <Step title="Choose Your Sacrifice" why="A conscious sacrifice turns intention into a promise you can honor daily."><View style={styles.chips}>{SACRIFICE_CATEGORIES.map((item) => <Chip key={item.key} testID={`sac-${item.key}`} label={item.label} emoji={item.emoji} selected={sacrificeCat === item.key} onPress={() => setSacrificeCat(item.key)} color={COLORS.cyan}/>)}</View>{sacrificeCat === "custom" && <TextInput testID="sacrifice-custom-input" style={styles.input} value={sacrificeCustom} onChangeText={setSacrificeCustom} placeholder="What will you give up?" placeholderTextColor={COLORS.gray2}/>}</Step>}
          {current === "burning" && <Step title="Your Burning Desire" why="Describe your deepest desire about your goal. These private words become the emotional center of your journey."><TextInput testID="burning-desire-input" style={styles.desireInput} value={burningDesire} onChangeText={setBurningDesire} multiline maxLength={600} placeholder="Write the desire that keeps calling you forward..." placeholderTextColor={COLORS.gray2}/><Text style={styles.required}>Required · {burningDesire.trim().length}/600</Text></Step>}
          {current === "affirmation" && <Step title="Your Affirmation" why="Repeated words train your attention to recognize and act on aligned opportunities."><ToggleCard testID="affirmation-toggle" title={affirmationOn ? "Affirmations ON" : "Affirmations OFF"} active={affirmationOn} onPress={() => setAffirmationOn(!affirmationOn)}/>{affirmationOn && <><TouchableOpacity testID="affirmation-language-row" onPress={() => setShowLanguages(true)}><Card style={styles.rowCard}><View><Text style={styles.cardTitle}>Language</Text><Text style={styles.cardSub}>{LANGUAGES.find((l) => l.code === affirmationLanguage)?.label}</Text></View><Ionicons name="chevron-forward" size={18} color={COLORS.gray2}/></Card></TouchableOpacity><Card style={{ marginTop: 12 }}><Text style={styles.cardTitle}>Custom affirmation (optional)</Text><TextInput testID="custom-affirmation-input" style={styles.multiInput} value={affirmationCustom} onChangeText={setAffirmationCustom} multiline placeholder="Leave blank for a personalized library affirmation" placeholderTextColor={COLORS.gray2}/></Card></>}</Step>}
          {current === "alarms" && <Step title="Wake-Up & Sleep Time" why="Anchor your day with intention when your mind is most receptive — at waking and before sleep."><AlarmRow label="Wake-up alarm" icon="sunny-outline" enabled={wakeEnabled} time={wakeTime} onToggle={() => setWakeEnabled(!wakeEnabled)} onTime={() => setPicker("wake")} prefix="wake"/><AlarmRow label="Sleep alarm" icon="moon-outline" enabled={sleepEnabled} time={sleepTime} onToggle={() => setSleepEnabled(!sleepEnabled)} onTime={() => setPicker("sleep")} prefix="sleep"/><View style={styles.importantBox} testID="alarm-importance-label"><Ionicons name="sparkles" size={20} color={COLORS.gold}/><Text style={styles.importantText}>Your wake-up affirmation and before-sleep affirmation are the MOST important moments of your day — don&apos;t miss them!</Text></View></Step>}
          {current === "reminders" && <Step title="Daily Reminders" why="Frequent, gentle returns to your intention make consistency easier than relying on motivation."><ToggleCard testID="reminders-toggle" title={remindersEnabled ? "Reminders ON" : "Reminders OFF"} active={remindersEnabled} onPress={() => setRemindersEnabled(!remindersEnabled)}/><Text style={styles.motivation}>Higher reminder frequency = stronger manifestation. Stay consistent, stay powerful!</Text>{remindersEnabled && <><Text style={styles.label}>FREQUENCY</Text><View style={styles.chips}>{REMINDER_OPTIONS.filter((value) => value > 0).map((value) => <Chip key={value} testID={`reminders-${value}`} label={`${value}x per day`} selected={reminderCount === value} onPress={() => { setReminderCount(value); resizeReminderTimes(value); }}/>)}</View><Text style={styles.label}>SCHEDULE</Text><View style={styles.modeRow}><ModeButton testID="reminder-mode-random" active={reminderMode === "random"} icon="shuffle" label="Random" onPress={() => setReminderMode("random")}/><ModeButton testID="reminder-mode-custom" active={reminderMode === "custom"} icon="time" label="Custom Times" onPress={() => { setReminderMode("custom"); resizeReminderTimes(reminderCount); }}/></View><View style={styles.reservedLabels} testID="reserved-alarm-labels"><Text style={styles.reservedText}>Wake-up reserved · {formatTime(wakeTime)}</Text><Text style={styles.reservedText}>Sleep reserved · {formatTime(sleepTime)}</Text></View>{reminderMode === "custom" && reminderTimes.slice(0, reminderCount).map((time, i) => <TouchableOpacity key={i} testID={`reminder-time-${i}`} style={styles.timeRow} onPress={() => setPicker(i)}><Text style={styles.cardTitle}>Reminder {i + 1}</Text><Text style={styles.timeValue}>{formatTime(time)}</Text></TouchableOpacity>)}<Text style={styles.label}>JOURNEY LENGTH</Text><View style={styles.chips}>{CYCLE_OPTIONS.map((cycle) => <Chip key={cycle.days} testID={`cycle-${cycle.days}`} label={cycle.label} selected={cycleDays === cycle.days} onPress={() => setCycleDays(cycle.days)}/>)}</View></>}</Step>}
          {current === "hustle" && <Step title="Link Your Hustle" why="Connecting effort to intention makes ordinary work feel purposeful and spiritually aligned."><ToggleCard testID="hustle-toggle" title={hustle ? "My hustle is linked" : "Link my daily hustle"} active={hustle} onPress={() => setHustle(!hustle)}/></Step>}
          {current === "fasting" && <Step title="Link Fasting" why="An optional fast can turn each craving into a mindful reminder of your promise."><ToggleCard testID="fasting-toggle" title={fasting ? "Fasting is linked" : "No fasting selected"} active={fasting} onPress={() => setFasting(!fasting)}/></Step>}
          {current === "confirm" && <Step title="Seal Your Commitment" why="Review the promise you are choosing to practice with consistency, discipline, and presence."><Card style={styles.summary}><Summary label="GOAL" value={goalCat === "custom" ? goalCustom : GOAL_CATEGORIES.find((g) => g.key === goalCat)?.label || "—"}/><Summary label="BURNING DESIRE" value={burningDesire}/><Summary label="AFFIRMATION" value={affirmationCustom.trim() || (affirmationOn ? "Personalized daily affirmation" : "Off")}/><Summary label="SACRIFICE" value={sacrificeCat === "custom" ? sacrificeCustom : SACRIFICE_CATEGORIES.find((s) => s.key === sacrificeCat)?.label || "—"}/><Summary label="ALARMS" value={`${wakeEnabled ? formatTime(wakeTime) : "Wake off"} · ${sleepEnabled ? formatTime(sleepTime) : "Sleep off"}`}/><Summary label="REMINDERS" value={remindersEnabled ? `${reminderCount}x/day · ${reminderMode}` : "Off"}/><Summary label="HUSTLE" value={hustle ? "Linked ✓ — daily effort tied to your goal" : "Not linked"}/><Summary label="FASTING" value={fasting ? "Linked ✓ — fasting tied to your goal" : "Not linked"}/></Card></Step>}
        </ScrollView>
        <View style={styles.footer}><FilledButton testID={current === "confirm" ? "manifest-submit" : "manifest-next"} label={current === "confirm" ? (busy ? "Starting..." : "Begin Manifestation") : "Continue"} onPress={current === "confirm" ? submit : () => setStep(step + 1)} disabled={!canContinue || busy}/></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    {Platform.OS === "android" && picker !== null && <DateTimePicker value={toDate(pickerValue)} mode="time" display="clock" onChange={onPickerChange}/>} 
    {Platform.OS === "ios" && <Modal transparent visible={picker !== null} animationType="slide" onRequestClose={() => setPicker(null)}><View style={styles.pickerBackdrop}><View style={styles.pickerCard}><View style={styles.pickerHead}><TouchableOpacity testID="time-picker-cancel" onPress={() => setPicker(null)}><Text style={styles.cardSub}>Cancel</Text></TouchableOpacity><Text style={styles.cardTitle}>Choose Time</Text><TouchableOpacity testID="time-picker-done" onPress={() => setPicker(null)}><Text style={styles.goldText}>Done</Text></TouchableOpacity></View><DateTimePicker value={toDate(pickerValue)} mode="time" display="spinner" themeVariant="dark" onChange={(_, date) => date && applyTime(toTime(date))}/></View></View></Modal>}
    {Platform.OS === "web" && picker !== null && <Modal transparent visible animationType="fade"><View style={styles.pickerBackdrop}><Card style={styles.webPicker}><Text style={styles.cardTitle}>Choose Time</Text><View style={styles.chips}>{["06:00","07:00","08:00","09:00","12:00","15:00","18:00","20:00","22:00","23:00"].map((time) => <Chip key={time} label={formatTime(time)} selected={pickerValue === time} onPress={() => applyTime(time)}/>)}</View><FilledButton testID="web-time-picker-done" label="Done" onPress={() => setPicker(null)} style={{ marginTop: 16 }}/></Card></View></Modal>}
    <LanguagePicker visible={showLanguages} selected={affirmationLanguage} onSelect={(code) => { setAffirmationLanguage(code); setShowLanguages(false); }} onClose={() => setShowLanguages(false)}/>
  </View>;
}

function Step({ title, why, children }: { title: string; why: string; children: React.ReactNode }) { return <View><Text style={styles.title}>{title}</Text><Text style={styles.why}>{why}</Text>{children}</View>; }
function ToggleCard({ testID, title, active, onPress }: { testID: string; title: string; active: boolean; onPress: () => void }) { return <TouchableOpacity testID={testID} onPress={onPress}><Card style={[styles.toggleCard, active && styles.activeCard]}><Text style={styles.cardTitle}>{title}</Text><Ionicons name={active ? "toggle" : "toggle-outline"} size={34} color={active ? COLORS.gold : COLORS.gray2}/></Card></TouchableOpacity>; }
function AlarmRow({ label, icon, enabled, time, onToggle, onTime, prefix }: any) { return <Card style={styles.alarmCard}><View style={styles.rowCard}><View style={styles.iconTitle}><Ionicons name={icon} size={22} color={COLORS.gold}/><View><Text style={styles.cardTitle}>{label}</Text><Text style={styles.cardSub}>Alarm-style sound · daily</Text></View></View><TouchableOpacity testID={`${prefix}-alarm-toggle`} onPress={onToggle}><Ionicons name={enabled ? "toggle" : "toggle-outline"} size={34} color={enabled ? COLORS.gold : COLORS.gray2}/></TouchableOpacity></View><TouchableOpacity testID={`${prefix}-alarm-time`} disabled={!enabled} style={[styles.alarmTime, !enabled && { opacity: .4 }]} onPress={onTime}><Text style={styles.timeValue}>{formatTime(time)}</Text><Ionicons name="chevron-forward" size={18} color={COLORS.gray2}/></TouchableOpacity></Card>; }
function ModeButton({ testID, active, icon, label, onPress }: any) { return <TouchableOpacity testID={testID} style={[styles.modeButton, active && styles.modeActive]} onPress={onPress}><Ionicons name={icon} size={17} color={active ? COLORS.void : COLORS.gray1}/><Text style={[styles.modeText, active && { color: COLORS.void }]}>{label}</Text></TouchableOpacity>; }
function Summary({ label, value }: { label: string; value: string }) { return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container:{flex:1},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingTop:8},back:{width:62,minHeight:44,flexDirection:"row",alignItems:"center",gap:3},backText:{color:COLORS.white,fontSize:14,fontWeight:"700"},progress:{flexDirection:"row",gap:5},dot:{width:6,height:6,borderRadius:3,backgroundColor:COLORS.gray3},dotActive:{width:15,backgroundColor:COLORS.gold},content:{padding:22,paddingBottom:30},title:{color:COLORS.white,fontSize:32,lineHeight:39,fontWeight:"900",marginTop:8},why:{color:COLORS.gray1,fontSize:15,lineHeight:23,marginTop:14,marginBottom:12},chips:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:10},input:{height:56,borderRadius:16,backgroundColor:COLORS.surface1,color:COLORS.white,paddingHorizontal:18,fontSize:16,marginTop:16},desireInput:{minHeight:180,borderRadius:22,backgroundColor:COLORS.surface1,color:COLORS.gold,padding:20,fontSize:21,fontWeight:"800",lineHeight:30,textAlignVertical:"top",marginTop:18,borderWidth:1,borderColor:COLORS.gold+"55"},required:{color:COLORS.gray1,fontSize:12,marginTop:9},toggleCard:{marginTop:12,minHeight:72,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderWidth:1,borderColor:"transparent"},activeCard:{borderColor:COLORS.gold+"88",backgroundColor:COLORS.gold+"0F"},cardTitle:{color:COLORS.white,fontSize:16,fontWeight:"800"},cardSub:{color:COLORS.gray1,fontSize:12.5,marginTop:3},rowCard:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},multiInput:{minHeight:100,color:COLORS.gold,fontSize:18,fontWeight:"800",lineHeight:26,textAlignVertical:"top",marginTop:12},alarmCard:{marginTop:12,gap:14},iconTitle:{flexDirection:"row",alignItems:"center",gap:12},alarmTime:{minHeight:50,borderRadius:14,backgroundColor:COLORS.surface2,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16},timeValue:{color:COLORS.gold,fontSize:19,fontWeight:"900"},importantBox:{flexDirection:"row",alignItems:"flex-start",gap:12,backgroundColor:COLORS.gold+"16",borderColor:COLORS.gold+"55",borderWidth:1,borderRadius:18,padding:16,marginTop:18},importantText:{color:COLORS.white,fontSize:14,fontWeight:"800",lineHeight:21,flex:1},motivation:{color:COLORS.gold,fontSize:16,fontWeight:"900",lineHeight:23,marginTop:18},label:{color:COLORS.gray2,fontSize:11,fontWeight:"800",letterSpacing:1.6,marginTop:22,marginBottom:7},modeRow:{flexDirection:"row",gap:10},modeButton:{flex:1,minHeight:48,borderRadius:14,backgroundColor:COLORS.surface1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},modeActive:{backgroundColor:COLORS.gold},modeText:{color:COLORS.gray1,fontSize:13,fontWeight:"800"},reservedLabels:{backgroundColor:COLORS.surface1,borderRadius:14,padding:12,marginTop:12,gap:5},reservedText:{color:COLORS.gold,fontSize:12.5,fontWeight:"700"},timeRow:{minHeight:54,borderRadius:14,backgroundColor:COLORS.surface1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16,marginTop:8},summary:{marginTop:18,gap:4},summaryRow:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:COLORS.gray3},summaryLabel:{color:COLORS.gray2,fontSize:10,fontWeight:"800",letterSpacing:1.4},summaryValue:{color:COLORS.gold,fontSize:18,fontWeight:"900",lineHeight:25,marginTop:5},footer:{paddingHorizontal:22,paddingVertical:12},pickerBackdrop:{flex:1,backgroundColor:"#000000CC",justifyContent:"flex-end"},pickerCard:{backgroundColor:COLORS.surface1,borderTopLeftRadius:24,borderTopRightRadius:24,padding:18},pickerHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},goldText:{color:COLORS.gold,fontSize:15,fontWeight:"800"},webPicker:{margin:24},alarmTitle:{color:COLORS.white},summaryText:{color:COLORS.white}
});