import { SPIRITUAL_MOON_NAMES } from "@/src/utils/spiritual-moon";

// Detailed spiritual meanings + practice guidance for each of the 17 moon-cycle days.
// Purely mystical/creative content — not scientific.
export const MOON_MEANINGS: Record<string, {
  meaning: string;
  manifestation: string;
  practice: string;
}> = {
  Ashaya: {
    meaning: "Ashaya, the Whispering Moon, is the seed of intention. Silence holds infinite possibility.",
    manifestation: "Perfect for planting the very first intention. Whatever thought you nurture today grows fastest.",
    practice: "Sit in stillness for 5 minutes. Whisper your goal to yourself three times before sleep.",
  },
  Nirvana: {
    meaning: "Silver Silence — the mind quiets, the soul listens. Insights arrive without effort.",
    manifestation: "A day of subtle receiving. Trust the signs and small coincidences that appear.",
    practice: "Journal 3 quiet observations. Avoid arguments and social noise.",
  },
  Vayu: {
    meaning: "The Wind Moon carries prayers across worlds. Movement becomes prayer.",
    manifestation: "Take one concrete physical step toward your goal today. Momentum multiplies.",
    practice: "Take a mindful walk. Breathe in intention, breathe out resistance.",
  },
  Prakash: {
    meaning: "Illumined Path — clarity awakens. What was hidden becomes visible.",
    manifestation: "Great day to make an important decision. Your intuition is sharp.",
    practice: "Light a candle. Write down 3 answers you have been avoiding.",
  },
  Aakash: {
    meaning: "Sky Moon expands your horizon. Limits dissolve into open space.",
    manifestation: "Set bigger visions. Small dreams cannot survive under this sky.",
    practice: "Spend 10 minutes outside looking up. Then write the biggest version of your goal.",
  },
  Devi: {
    meaning: "Sacred Feminine energy flows. Intuition, receiving, softness — all amplified.",
    manifestation: "Ideal for softening rigid effort. Let manifestations come to you rather than chasing.",
    practice: "Give thanks 7 times today. Receive one gift without deflecting.",
  },
  Yog: {
    meaning: "Union Moon — inner and outer worlds align. Ritual works with less friction.",
    manifestation: "Any spiritual practice today counts double. Consistency is the true magic.",
    practice: "Do your ritual with extra intention. Pause between breaths.",
  },
  Anant: {
    meaning: "The Infinite Moon. Boundaries feel thin. Your energy reaches farther than you know.",
    manifestation: "A powerful day to send blessings outward. What you give returns amplified.",
    practice: "Bless three people silently. Donate any small amount if you can.",
  },
  Tejas: {
    meaning: "Radiant Flame ignites courage. Fear-based blocks burn away.",
    manifestation: "Take the bold action you have been postponing.",
    practice: "Do one thing that scares you slightly. Speak your intention out loud once.",
  },
  Shanti: {
    meaning: "Moon of Peace. The soul rests. Manifestation happens through non-resistance.",
    manifestation: "Effortless days — stop pushing. Trust that the outcome is already unfolding.",
    practice: "Rest without guilt. Say 'thank you' before each meal.",
  },
  Amrit: {
    meaning: "Nectar Moon — healing energy flows through you. Old wounds soften.",
    manifestation: "Perfect for manifestations related to health, forgiveness, or emotional freedom.",
    practice: "Drink water mindfully. Forgive one small grudge (even silently).",
  },
  Antaram: {
    meaning: "The Inner Moon reveals what you truly want beneath what you say you want.",
    manifestation: "Re-examine your goal today. Adjust if the deeper truth has shifted.",
    practice: "Ask yourself 'What do I really want?' three times. Write the answer without editing.",
  },
  Divya: {
    meaning: "Divine Moon — synchronicities multiply. Doors open in unexpected directions.",
    manifestation: "Say YES to unexpected offers today. They carry hidden gifts.",
    practice: "Notice one 'coincidence' before evening. Follow it wherever it leads.",
  },
  Chetna: {
    meaning: "Awakening Moon shakes you gently. Old patterns feel intolerable.",
    manifestation: "Release one habit that no longer serves your goal.",
    practice: "Identify a limiting belief. Replace it with the opposite truth in writing.",
  },
  Aatma: {
    meaning: "Soul Moon. Your higher self speaks clearly through instincts.",
    manifestation: "Trust your first response today. Overthinking dilutes power.",
    practice: "When faced with any choice, count to 3 and go with your first pull.",
  },
  Kripa: {
    meaning: "Moon of Grace — the universe carries part of your load. You are protected.",
    manifestation: "Ask directly. Prayers and requests today land with force.",
    practice: "Write your ask on paper. Burn it or place it under moonlight (symbolic).",
  },
  Purnata: {
    meaning: "Wholeness Moon — the cycle completes. Integration and celebration.",
    manifestation: "Acknowledge how far you have come. Prepare for the next spiral.",
    practice: "Celebrate one small win. Meditate on the words 'I am enough.'",
  },
};

export function getMoonDetail(name: string) {
  return MOON_MEANINGS[name] ?? {
    meaning: "The moon shifts, and so does your inner tide.",
    manifestation: "Any intention set today ripples forward.",
    practice: "Sit with your goal. Breathe. Repeat.",
  };
}

export function getCosmicMeaning(level: number) {
  if (level >= 85) return {
    label: "Peak Power",
    meaning: "The cosmic tide is at its highest. Doors that were shut become fluid. Rituals performed now carry extra weight.",
    tip: "Perform your hold-to-manifest ritual immediately. Ask boldly for what you want.",
  };
  if (level >= 65) return {
    label: "Rising Tide",
    meaning: "Momentum builds. Actions taken now compound faster than usual.",
    tip: "Focus on ONE goal-aligned action today. Consistency > intensity.",
  };
  if (level >= 40) return {
    label: "Steady Current",
    meaning: "A grounded, balanced day. Nothing dramatic — everything possible.",
    tip: "Refine details. Journal. Prepare for higher tides ahead.",
  };
  return {
    label: "Quiet Flow",
    meaning: "The cosmos rests. Effort feels heavier — because it is meant to be lighter today.",
    tip: "Do the ritual anyway. Consistency during low tides builds the reservoir.",
  };
}

// Ensure SPIRITUAL_MOON_NAMES is exported/consumed here to keep imports single-source
export const MOON_NAMES = SPIRITUAL_MOON_NAMES.map((m) => m.name);
