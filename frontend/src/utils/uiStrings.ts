import { api } from "./api";

// Fixed, short ritual/notification UI phrases — translated into the user's selected
// affirmation language on the backend (data/ui_strings_i18n.json). {{SACRIFICE}}/{{GOAL}}
// tokens inside `sacrifice_template` are returned literally and must be substituted with the
// user's actual (English) sacrifice/goal category names via `fillSacrificeTemplate` below —
// there is no per-category-name translation data yet, only these surrounding template words.
export type UiStrings = {
  sacrifice_template: string;
  dont_give_up_sacrifice: string;
  chant_affirmation_10: string;
  chant_this_10_too: string;
  take_deep_breaths: string;
  return_tomorrow: string;
};

export const DEFAULT_UI_STRINGS: UiStrings = {
  sacrifice_template: "I am sacrificing {{SACRIFICE}} to get {{GOAL}}",
  dont_give_up_sacrifice: "Don't forget the goal and don't give up on sacrifice",
  chant_affirmation_10: "Chant affirmation 10 times in mind",
  chant_this_10_too: "Chant this 10 times too, then begin",
  take_deep_breaths: "Take deep breaths, then chant in mind:",
  return_tomorrow: "Don't forget \u2014 return tomorrow to add more power",
};

export async function fetchUiStrings(language?: string): Promise<UiStrings> {
  try {
    const res = await api<{ language: string; strings: Partial<UiStrings> }>(
      `/ui-strings?language=${encodeURIComponent(language || "english")}`
    );
    return { ...DEFAULT_UI_STRINGS, ...res.strings };
  } catch {
    return DEFAULT_UI_STRINGS;
  }
}

// Goal/Sacrifice category label translations (e.g. "Wealth" -> "धन" in Hindi), keyed by the
// category `key` from GOAL_CATEGORIES/SACRIFICE_CATEGORIES. Used so the sacrifice-affirmation
// sentence shows the actual goal/sacrifice NAME in the selected language too, not just the
// surrounding template words.
export async function fetchCategoryLabels(language?: string): Promise<Record<string, string>> {
  try {
    const res = await api<{ language: string; labels: Record<string, string> }>(
      `/category-labels?language=${encodeURIComponent(language || "english")}`
    );
    return res.labels || {};
  } catch {
    return {};
  }
}

export function fillSacrificeTemplate(template: string, sacrifice: string, goal: string): string {
  return template.replace("{{SACRIFICE}}", sacrifice).replace("{{GOAL}}", goal);
}
