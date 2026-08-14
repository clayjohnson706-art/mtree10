// Local moon phase calculation
// Reference: Jan 6, 2000 18:14 UTC — known new moon
const REF = Date.UTC(2000, 0, 6, 18, 14, 0);
const CYCLE = 29.53058770576 * 24 * 60 * 60 * 1000;

const PHASES = [
  { key: "new_moon", label: "New Moon", emoji: "🌑" },
  { key: "waxing_crescent", label: "Waxing Crescent", emoji: "🌒" },
  { key: "first_quarter", label: "First Quarter", emoji: "🌓" },
  { key: "waxing_gibbous", label: "Waxing Gibbous", emoji: "🌔" },
  { key: "full_moon", label: "Full Moon", emoji: "🌕" },
  { key: "waning_gibbous", label: "Waning Gibbous", emoji: "🌖" },
  { key: "last_quarter", label: "Last Quarter", emoji: "🌗" },
  { key: "waning_crescent", label: "Waning Crescent", emoji: "🌘" },
];

export function getMoonPhase(date: Date = new Date()) {
  const elapsed = date.getTime() - REF;
  const cycles = elapsed / CYCLE;
  const phase = cycles - Math.floor(cycles); // 0..1
  const dayInCycle = Math.floor(phase * 29.53);
  const idx = Math.floor(phase * 8) % 8;
  return {
    ...PHASES[idx],
    dayInCycle: dayInCycle + 1,
    illumination: Math.round((1 - Math.abs(phase * 2 - 1)) * 100),
  };
}
