// Central source of truth for all official legal document URLs (hosted on Google Sites).
// Every legal link in the app (Auth checkbox, Settings > Legal section) must import from
// here instead of hardcoding URLs, so updating a link only ever needs to happen in one place.
export const LEGAL_LINKS = {
  privacyPolicy: "https://sites.google.com/view/mtreeappprivacypolicy/",
  termsAndConditions: "https://sites.google.com/view/mtreeapptermsandconditions/",
  refundPolicy: "https://sites.google.com/view/mtreeapprefundpolicy/",
  accountDeletion: "https://sites.google.com/view/mtreeappaccdeletion/",
} as const;

export type LegalLinkKey = keyof typeof LEGAL_LINKS;
