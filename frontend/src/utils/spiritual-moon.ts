// 17-day spiritual moon cycle. Purely creative/mystical — not scientific.
// Cycles indefinitely starting from a fixed reference date.

const CYCLE_DAYS = 17;
const REF = Date.UTC(2024, 0, 1); // Jan 1 2024 UTC anchor

export const SPIRITUAL_MOON_NAMES = [
  { name: "Ashaya", desc: "The Whispering Moon", emoji: "🌑" },
  { name: "Nirvana", desc: "Silver Silence", emoji: "🌒" },
  { name: "Vayu", desc: "The Wind Moon", emoji: "🌒" },
  { name: "Prakash", desc: "Illumined Path", emoji: "🌓" },
  { name: "Aakash", desc: "Sky Moon", emoji: "🌓" },
  { name: "Devi", desc: "Sacred Feminine", emoji: "🌔" },
  { name: "Yog", desc: "Union Moon", emoji: "🌔" },
  { name: "Anant", desc: "The Infinite", emoji: "🌕" },
  { name: "Tejas", desc: "Radiant Flame", emoji: "🌕" },
  { name: "Shanti", desc: "Moon of Peace", emoji: "🌕" },
  { name: "Amrit", desc: "Nectar Moon", emoji: "🌖" },
  { name: "Antaram", desc: "The Inner Moon", emoji: "🌖" },
  { name: "Divya", desc: "Divine Moon", emoji: "🌗" },
  { name: "Chetna", desc: "Awakening Moon", emoji: "🌗" },
  { name: "Aatma", desc: "Soul Moon", emoji: "🌘" },
  { name: "Kripa", desc: "Moon of Grace", emoji: "🌘" },
  { name: "Purnata", desc: "Wholeness Moon", emoji: "🌑" },
];

export function getSpiritualMoonDay(date: Date = new Date()) {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSince = Math.floor((utcMidnight - REF) / (24 * 60 * 60 * 1000));
  const dayIndex = ((daysSince % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS;
  const entry = SPIRITUAL_MOON_NAMES[dayIndex];
  return {
    ...entry,
    dayNumber: dayIndex + 1,
    total: CYCLE_DAYS,
  };
}

export function formatTodayLong(date: Date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTodayShort(date: Date = new Date()) {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
