import { Platform } from "react-native";

const ID_PREFIX = "mtree-reminder-";
const ALARM_PREFIX = "mtree-alarm-";
const STANDARD_CHANNEL = "mtree-standard-v2";
const ALARM_CHANNEL = "mtree-ritual-alarms-v2";
const STREAK_REMINDER_ID = "mtree-streak-reminder";
const RITUAL_BODY = "Pause, breathe, and return to your sacred intention with steady discipline.";

let Notifications: typeof import("expo-notifications") | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    if (Platform.OS === "android") {
      Notifications!.setNotificationChannelAsync(STANDARD_CHANNEL, {
        name: "mTree reminders",
        importance: Notifications!.AndroidImportance.DEFAULT,
        sound: null,
        vibrationPattern: [0, 180],
        lightColor: "#F5C542",
      }).catch(() => {});
      Notifications!.setNotificationChannelAsync(ALARM_CHANNEL, {
        name: "Wake-up and sleep ritual alarms",
        importance: Notifications!.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 800, 350, 800, 350, 1200],
        lightColor: "#F5C542",
        lockscreenVisibility: Notifications!.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      }).catch(() => {});
    }
  } catch {
    Notifications = null;
  }
}

export function notificationsAvailable(): boolean { return !!Notifications; }
export type NotificationPermissionState = "granted" | "undetermined" | "denied" | "blocked" | "unavailable";

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (!Notifications) return "unavailable";
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status === "granted") return "granted";
    if (perm.status === "denied") return perm.canAskAgain === false ? "blocked" : "denied";
    return "undetermined";
  } catch { return "unavailable"; }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    const final = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
    return final.status === "granted";
  } catch { return false; }
}

function toMinutes(hhmm?: string | null): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function inWindow(min: number, start: number, end: number): boolean {
  if (start === end) return true;
  return start < end ? min >= start && min < end : min >= start || min < end;
}

function circularDiff(a: number, b: number) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 1440 - diff);
}

function availableMinutes(
  busyStart?: string | null,
  busyEnd?: string | null,
  wakeTime?: string | null,
  sleepTime?: string | null,
): number[] {
  const busyA = toMinutes(busyStart); const busyB = toMinutes(busyEnd);
  const wake = toMinutes(wakeTime); const sleep = toMinutes(sleepTime);
  const result: number[] = [];
  for (let minute = 0; minute < 1440; minute++) {
    const insideActiveHours = wake == null || sleep == null || inWindow(minute, wake, sleep);
    const insideBusyHours = busyA != null && busyB != null && busyA !== busyB && inWindow(minute, busyA, busyB);
    const reservedAlarmTime = (wake != null && circularDiff(minute, wake) <= 10)
      || (sleep != null && circularDiff(minute, sleep) <= 10);
    if (insideActiveHours && !insideBusyHours && !reservedAlarmTime) result.push(minute);
  }
  return result;
}

export function isReservedAlarmTime(time: string, wakeTime?: string | null, sleepTime?: string | null): "wake-up" | "sleep" | null {
  const minute = toMinutes(time); const wake = toMinutes(wakeTime); const sleep = toMinutes(sleepTime);
  if (minute == null) return null;
  if (wake != null && minute === wake) return "wake-up";
  if (sleep != null && minute === sleep) return "sleep";
  return null;
}

export function computeEvenReminderTimes(
  count: number,
  busyStart?: string | null,
  busyEnd?: string | null,
  wakeTime?: string | null,
  sleepTime?: string | null,
): { hour: number; minute: number }[] {
  const available = availableMinutes(busyStart, busyEnd, wakeTime, sleepTime);
  if (count <= 0 || !available.length) return [];
  return Array.from({ length: count }, (_, i) => {
    const index = Math.min(available.length - 1, Math.floor(((i + 0.5) * available.length) / count));
    const minute = available[index];
    return { hour: Math.floor(minute / 60), minute: minute % 60 };
  });
}

export function computeRandomReminderTimes(
  count: number,
  busyStart?: string | null,
  busyEnd?: string | null,
  wakeTime?: string | null,
  sleepTime?: string | null,
): { hour: number; minute: number }[] {
  const available = availableMinutes(busyStart, busyEnd, wakeTime, sleepTime);
  if (count <= 0 || !available.length) return [];
  const chosen: number[] = [];
  const minGap = Math.max(20, Math.floor(available.length / Math.max(2, count * 2)));
  for (let attempts = 0; chosen.length < count && attempts < count * 500; attempts++) {
    const candidate = available[Math.floor(Math.random() * available.length)];
    if (chosen.every((value) => circularDiff(value, candidate) >= minGap)) chosen.push(candidate);
  }
  while (chosen.length < count) chosen.push(available[Math.floor(Math.random() * available.length)]);
  return chosen.sort((a, b) => a - b).map((minute) => ({ hour: Math.floor(minute / 60), minute: minute % 60 }));
}

async function cancelByPrefix(prefix: string) {
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter((n) => n.identifier?.startsWith(prefix)).map((n) => Notifications!.cancelScheduledNotificationAsync(n.identifier)));
  } catch {}
}

export async function cancelAllReminders() { return cancelByPrefix(ID_PREFIX); }
export async function cancelWakeSleepAlarms() { return cancelByPrefix(ALARM_PREFIX); }
export async function dismissDeliveredNotification(identifier?: string) {
  if (!Notifications) return;
  try {
    if (identifier) await Notifications.dismissNotificationAsync(identifier);
    else await Notifications.dismissAllNotificationsAsync();
  } catch {}
}

export async function scheduleWakeSleepAlarms(
  wakeEnabled: boolean,
  wakeTime: string,
  sleepEnabled: boolean,
  sleepTime: string,
): Promise<{ scheduled: boolean; permission: NotificationPermissionState }> {
  if (!Notifications) return { scheduled: false, permission: "unavailable" };
  await cancelWakeSleepAlarms();
  if (!wakeEnabled && !sleepEnabled) return { scheduled: false, permission: await getNotificationPermissionState() };
  if (!await requestNotificationPermissions()) return { scheduled: false, permission: await getNotificationPermissionState() };
  const definitions = [
    wakeEnabled && { id: `${ALARM_PREFIX}wake`, time: wakeTime || "07:00", kind: "wake", title: "Rise With Intention", body: "Awaken your discipline and spirit — speak your affirmation and step into today with sacred purpose." },
    sleepEnabled && { id: `${ALARM_PREFIX}sleep`, time: sleepTime || "22:00", kind: "sleep", title: "Close The Day In Faith", body: "Let gratitude quiet your mind — affirm your intention before sleep and trust the path you are building." },
  ].filter(Boolean) as { id: string; time: string; kind: string; title: string; body: string }[];
  try {
    await Promise.all(definitions.map((item) => {
      const [hour, minute] = item.time.split(":").map(Number);
      return Notifications!.scheduleNotificationAsync({
        identifier: item.id,
        content: {
          title: item.title,
          body: item.body,
          sound: Platform.OS === "ios" ? "default" : undefined,
          priority: Notifications!.AndroidNotificationPriority.MAX,
          sticky: true,
          autoDismiss: false,
          data: { type: "ritual-reminder", kind: item.kind, eventId: item.id },
          ...(Platform.OS === "android" ? { channelId: ALARM_CHANNEL } : {}),
        },
        trigger: { type: Notifications!.SchedulableTriggerInputTypes.DAILY, hour, minute, repeats: true } as any,
      });
    }));
    return { scheduled: true, permission: "granted" };
  } catch { return { scheduled: false, permission: "granted" }; }
}

export async function rescheduleReminders(
  count: number,
  busyStart?: string | null,
  busyEnd?: string | null,
  mode: "random" | "custom" = "random",
  customTimes: string[] = [],
  wakeTime?: string | null,
  sleepTime?: string | null,
): Promise<{ scheduled: boolean; permission: NotificationPermissionState }> {
  if (!Notifications) return { scheduled: false, permission: "unavailable" };
  await cancelAllReminders();
  if (!count || count <= 0) return { scheduled: false, permission: await getNotificationPermissionState() };
  if (!await requestNotificationPermissions()) return { scheduled: false, permission: await getNotificationPermissionState() };
  try {
    if (mode === "custom" && customTimes.length) {
      const safeTimes = customTimes.slice(0, count).filter((time) => !isReservedAlarmTime(time, wakeTime, sleepTime));
      await Promise.all(safeTimes.map((time, index) => {
        const [hour, minute] = time.split(":").map(Number);
        return Notifications!.scheduleNotificationAsync({
          identifier: `${ID_PREFIX}custom-${index}`,
          content: {
            title: "Your Intention Is Calling",
            body: RITUAL_BODY,
            sound: false,
            data: { type: "ritual-reminder", kind: "custom", eventId: `${ID_PREFIX}custom-${index}` },
            ...(Platform.OS === "android" ? { channelId: STANDARD_CHANNEL } : {}),
          },
          trigger: { type: Notifications!.SchedulableTriggerInputTypes.DAILY, hour, minute, repeats: true } as any,
        });
      }));
    } else {
      const horizonDays = Math.max(2, Math.min(14, Math.floor(60 / Math.max(1, count))));
      const now = new Date();
      const jobs: Promise<string>[] = [];
      for (let day = 0; day < horizonDays; day++) {
        const times = computeRandomReminderTimes(count, busyStart, busyEnd, wakeTime, sleepTime);
        times.forEach((time, index) => {
          const target = new Date(now);
          target.setDate(now.getDate() + day);
          target.setHours(time.hour, time.minute, 0, 0);
          if (target <= now) return;
          const dateKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
          const eventId = `${ID_PREFIX}random-${dateKey}-${index}`;
          jobs.push(Notifications!.scheduleNotificationAsync({
            identifier: eventId,
            content: {
              title: "Your Intention Is Calling",
              body: RITUAL_BODY,
              sound: false,
              data: { type: "ritual-reminder", kind: "random", eventId },
              ...(Platform.OS === "android" ? { channelId: STANDARD_CHANNEL } : {}),
            },
            trigger: { type: Notifications!.SchedulableTriggerInputTypes.DATE, date: target } as any,
          }));
        });
      }
      await Promise.all(jobs);
    }
    return { scheduled: true, permission: "granted" };
  } catch { return { scheduled: false, permission: "granted" }; }
}

export async function cancelStreakReminder() {
  if (!Notifications) return;
  try { await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID); } catch {}
}

export async function scheduleStreakReminder(time: string, ritualDoneToday = false): Promise<{ scheduled: boolean; permission: NotificationPermissionState }> {
  if (!Notifications) return { scheduled: false, permission: "unavailable" };
  await cancelStreakReminder();
  if (!await requestNotificationPermissions()) return { scheduled: false, permission: await getNotificationPermissionState() };
  const [hour, minute] = (time || "20:00").split(":").map(Number);
  try {
    // DAILY repeating trigger — survives app kills and device restarts (expo-notifications
    // re-registers repeating schedules after boot), unlike a one-shot DATE trigger that dies
    // after firing once until the app happens to reschedule it.
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        title: "Protect Your Daily Streak",
        body: "Complete today's ritual before the day ends — discipline keeps your intention alive.",
        sound: false,
        data: { type: "streak-reminder" },
        ...(Platform.OS === "android" ? { channelId: STANDARD_CHANNEL } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, repeats: true } as any,
    });
    return { scheduled: true, permission: "granted" };
  } catch { return { scheduled: false, permission: "granted" }; }
}