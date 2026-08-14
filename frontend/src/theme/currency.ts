import * as Localization from "expo-localization";

// Approximate fixed exchange rates (units of currency per 1 INR) — display-only, since no
// live payment gateway is wired up yet. Mirrors backend CURRENCY_RATE_PER_INR in server.py —
// keep both in sync if these are ever adjusted.
export const CURRENCIES: Record<string, { symbol: string; name: string; ratePerInr: number }> = {
  INR: { symbol: "₹", name: "Indian Rupee", ratePerInr: 1 },
  USD: { symbol: "$", name: "US Dollar", ratePerInr: 0.0121 },
  EUR: { symbol: "€", name: "Euro", ratePerInr: 0.0111 },
  GBP: { symbol: "£", name: "British Pound", ratePerInr: 0.0095 },
  AED: { symbol: "AED ", name: "UAE Dirham", ratePerInr: 0.0445 },
  SAR: { symbol: "SAR ", name: "Saudi Riyal", ratePerInr: 0.0453 },
  QAR: { symbol: "QAR ", name: "Qatari Riyal", ratePerInr: 0.044 },
  KWD: { symbol: "KWD ", name: "Kuwaiti Dinar", ratePerInr: 0.0037 },
  OMR: { symbol: "OMR ", name: "Omani Rial", ratePerInr: 0.00465 },
  BHD: { symbol: "BHD ", name: "Bahraini Dinar", ratePerInr: 0.00456 },
  CAD: { symbol: "CA$", name: "Canadian Dollar", ratePerInr: 0.0165 },
  AUD: { symbol: "A$", name: "Australian Dollar", ratePerInr: 0.0184 },
  NZD: { symbol: "NZ$", name: "New Zealand Dollar", ratePerInr: 0.0202 },
  SGD: { symbol: "S$", name: "Singapore Dollar", ratePerInr: 0.0162 },
  MYR: { symbol: "RM", name: "Malaysian Ringgit", ratePerInr: 0.0537 },
  IDR: { symbol: "Rp", name: "Indonesian Rupiah", ratePerInr: 190.5 },
  PHP: { symbol: "₱", name: "Philippine Peso", ratePerInr: 0.685 },
  THB: { symbol: "฿", name: "Thai Baht", ratePerInr: 0.418 },
  VND: { symbol: "₫", name: "Vietnamese Dong", ratePerInr: 305.2 },
  BDT: { symbol: "৳", name: "Bangladeshi Taka", ratePerInr: 1.325 },
  PKR: { symbol: "₨", name: "Pakistani Rupee", ratePerInr: 3.36 },
  LKR: { symbol: "Rs", name: "Sri Lankan Rupee", ratePerInr: 3.62 },
  NPR: { symbol: "₨", name: "Nepalese Rupee", ratePerInr: 1.6 },
  MMK: { symbol: "K", name: "Myanmar Kyat", ratePerInr: 25.4 },
  CNY: { symbol: "¥", name: "Chinese Yuan", ratePerInr: 0.0868 },
  JPY: { symbol: "¥", name: "Japanese Yen", ratePerInr: 1.84 },
  KRW: { symbol: "₩", name: "South Korean Won", ratePerInr: 16.4 },
  HKD: { symbol: "HK$", name: "Hong Kong Dollar", ratePerInr: 0.0942 },
  TWD: { symbol: "NT$", name: "Taiwan Dollar", ratePerInr: 0.373 },
  BRL: { symbol: "R$", name: "Brazilian Real", ratePerInr: 0.0637 },
  MXN: { symbol: "MX$", name: "Mexican Peso", ratePerInr: 0.206 },
  ARS: { symbol: "AR$", name: "Argentine Peso", ratePerInr: 12.1 },
  CLP: { symbol: "CL$", name: "Chilean Peso", ratePerInr: 11.4 },
  COP: { symbol: "CO$", name: "Colombian Peso", ratePerInr: 47.3 },
  ZAR: { symbol: "R", name: "South African Rand", ratePerInr: 0.221 },
  NGN: { symbol: "₦", name: "Nigerian Naira", ratePerInr: 18.9 },
  KES: { symbol: "KSh", name: "Kenyan Shilling", ratePerInr: 1.56 },
  EGP: { symbol: "EGP ", name: "Egyptian Pound", ratePerInr: 0.594 },
  GHS: { symbol: "GH₵", name: "Ghanaian Cedi", ratePerInr: 0.156 },
  MAD: { symbol: "MAD ", name: "Moroccan Dirham", ratePerInr: 0.121 },
  TZS: { symbol: "TSh", name: "Tanzanian Shilling", ratePerInr: 30.7 },
  UGX: { symbol: "USh", name: "Ugandan Shilling", ratePerInr: 44.6 },
  TRY: { symbol: "₺", name: "Turkish Lira", ratePerInr: 0.412 },
  RUB: { symbol: "₽", name: "Russian Ruble", ratePerInr: 1.09 },
  UAH: { symbol: "₴", name: "Ukrainian Hryvnia", ratePerInr: 0.503 },
  PLN: { symbol: "zł", name: "Polish Zloty", ratePerInr: 0.0479 },
  CZK: { symbol: "Kč", name: "Czech Koruna", ratePerInr: 0.276 },
  HUF: { symbol: "Ft", name: "Hungarian Forint", ratePerInr: 4.31 },
  RON: { symbol: "lei", name: "Romanian Leu", ratePerInr: 0.0552 },
  SEK: { symbol: "kr", name: "Swedish Krona", ratePerInr: 0.128 },
  NOK: { symbol: "kr", name: "Norwegian Krone", ratePerInr: 0.131 },
  DKK: { symbol: "kr", name: "Danish Krone", ratePerInr: 0.0828 },
  CHF: { symbol: "CHF ", name: "Swiss Franc", ratePerInr: 0.0107 },
  ILS: { symbol: "₪", name: "Israeli Shekel", ratePerInr: 0.0446 },
  IQD: { symbol: "IQD ", name: "Iraqi Dinar", ratePerInr: 15.9 },
  JOD: { symbol: "JOD ", name: "Jordanian Dinar", ratePerInr: 0.00858 },
  LBP: { symbol: "LBP ", name: "Lebanese Pound", ratePerInr: 1080 },
  KZT: { symbol: "₸", name: "Kazakhstani Tenge", ratePerInr: 5.86 },
  UZS: { symbol: "UZS ", name: "Uzbekistani Som", ratePerInr: 155 },
  AZN: { symbol: "₼", name: "Azerbaijani Manat", ratePerInr: 0.0206 },
  GEL: { symbol: "₾", name: "Georgian Lari", ratePerInr: 0.0327 },
};

// ISO2 country code -> currency code. Countries not listed here fall back to USD.
export const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR", US: "USD", GB: "GBP",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", PT: "EUR", IE: "EUR",
  AT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR",
  LT: "EUR", CY: "EUR", MT: "EUR", HR: "EUR",
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", OM: "OMR", BH: "BHD", IQ: "IQD", JO: "JOD",
  LB: "LBP", IL: "ILS",
  CA: "CAD", AU: "AUD", NZ: "NZD", SG: "SGD",
  MY: "MYR", ID: "IDR", PH: "PHP", TH: "THB", VN: "VND", BD: "BDT", PK: "PKR", LK: "LKR",
  NP: "NPR", MM: "MMK",
  CN: "CNY", JP: "JPY", KR: "KRW", HK: "HKD", TW: "TWD",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP",
  ZA: "ZAR", NG: "NGN", KE: "KES", EG: "EGP", GH: "GHS", MA: "MAD", TZ: "TZS", UG: "UGX",
  TR: "TRY", RU: "RUB", UA: "UAH",
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", SE: "SEK", NO: "NOK", DK: "DKK", CH: "CHF",
  KZ: "KZT", UZ: "UZS", AZ: "AZN", GE: "GEL",
};

// Display names for the country picker (onboarding + settings). Flags are generated on the
// fly from the ISO2 code — see flagEmoji() below.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "IN", name: "India" }, { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" }, { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" }, { code: "NL", name: "Netherlands" }, { code: "BE", name: "Belgium" },
  { code: "PT", name: "Portugal" }, { code: "IE", name: "Ireland" }, { code: "AT", name: "Austria" },
  { code: "FI", name: "Finland" }, { code: "GR", name: "Greece" }, { code: "LU", name: "Luxembourg" },
  { code: "SK", name: "Slovakia" }, { code: "SI", name: "Slovenia" }, { code: "EE", name: "Estonia" },
  { code: "LV", name: "Latvia" }, { code: "LT", name: "Lithuania" }, { code: "CY", name: "Cyprus" },
  { code: "MT", name: "Malta" }, { code: "HR", name: "Croatia" },
  { code: "AE", name: "United Arab Emirates" }, { code: "SA", name: "Saudi Arabia" }, { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" }, { code: "OM", name: "Oman" }, { code: "BH", name: "Bahrain" },
  { code: "IQ", name: "Iraq" }, { code: "JO", name: "Jordan" }, { code: "LB", name: "Lebanon" }, { code: "IL", name: "Israel" },
  { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" }, { code: "NZ", name: "New Zealand" }, { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" }, { code: "ID", name: "Indonesia" }, { code: "PH", name: "Philippines" },
  { code: "TH", name: "Thailand" }, { code: "VN", name: "Vietnam" }, { code: "BD", name: "Bangladesh" },
  { code: "PK", name: "Pakistan" }, { code: "LK", name: "Sri Lanka" }, { code: "NP", name: "Nepal" }, { code: "MM", name: "Myanmar" },
  { code: "CN", name: "China" }, { code: "JP", name: "Japan" }, { code: "KR", name: "South Korea" },
  { code: "HK", name: "Hong Kong" }, { code: "TW", name: "Taiwan" },
  { code: "BR", name: "Brazil" }, { code: "MX", name: "Mexico" }, { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" }, { code: "CO", name: "Colombia" },
  { code: "ZA", name: "South Africa" }, { code: "NG", name: "Nigeria" }, { code: "KE", name: "Kenya" },
  { code: "EG", name: "Egypt" }, { code: "GH", name: "Ghana" }, { code: "MA", name: "Morocco" },
  { code: "TZ", name: "Tanzania" }, { code: "UG", name: "Uganda" },
  { code: "TR", name: "Turkey" }, { code: "RU", name: "Russia" }, { code: "UA", name: "Ukraine" },
  { code: "PL", name: "Poland" }, { code: "CZ", name: "Czech Republic" }, { code: "HU", name: "Hungary" },
  { code: "RO", name: "Romania" }, { code: "SE", name: "Sweden" }, { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" }, { code: "CH", name: "Switzerland" },
  { code: "KZ", name: "Kazakhstan" }, { code: "UZ", name: "Uzbekistan" }, { code: "AZ", name: "Azerbaijan" }, { code: "GE", name: "Georgia" },
];

// Converts an ISO2 country code into its flag emoji using regional indicator symbols.
export function flagEmoji(countryCode?: string | null): string {
  if (!countryCode || countryCode.length !== 2) return "🏳️";
  return countryCode
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function getCurrencyCode(countryCode?: string | null): string {
  if (!countryCode) return "USD";
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] || "USD";
}

export function getCurrencyInfo(countryCode?: string | null) {
  const code = getCurrencyCode(countryCode);
  return { code, ...(CURRENCIES[code] || CURRENCIES.USD) };
}

// Converts a base price (always authored in INR) into the given country's local currency.
export function convertFromINR(inrAmount: number, countryCode?: string | null): number {
  const { ratePerInr } = getCurrencyInfo(countryCode);
  const converted = inrAmount * ratePerInr;
  // Currencies with very large nominal units (IDR, VND, KRW...) look better rounded to whole
  // numbers; smaller-unit currencies keep up to 2 decimals.
  return converted >= 100 ? Math.round(converted) : Math.round(converted * 100) / 100;
}

// Formats a base INR price as a local-currency string, e.g. convertPrice(49, "US") -> "$0.59".
export function formatPrice(inrAmount: number, countryCode?: string | null): string {
  const { symbol } = getCurrencyInfo(countryCode);
  const val = convertFromINR(inrAmount, countryCode);
  return `${symbol}${val.toLocaleString()}`;
}

// Maps common IANA timezones to their primary country. Timezones are usually auto-set by the
// OS/network based on actual geography, which makes them a far more reliable signal than the
// device's display-language locale — many Android phones (common in India/SE Asia) ship with
// "English (United States)" as the default display language regardless of where the device
// physically is, which previously caused detectDeviceCountry() to wrongly report "US".
const TIMEZONE_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Anchorage": "US", "Pacific/Honolulu": "US",
  "America/Phoenix": "US", "America/Detroit": "US",
  "Europe/London": "GB",
  "Europe/Berlin": "DE", "Europe/Paris": "FR", "Europe/Rome": "IT", "Europe/Madrid": "ES",
  "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Lisbon": "PT", "Europe/Dublin": "IE",
  "Europe/Vienna": "AT", "Europe/Helsinki": "FI", "Europe/Athens": "GR", "Europe/Luxembourg": "LU",
  "Europe/Bratislava": "SK", "Europe/Ljubljana": "SI", "Europe/Tallinn": "EE", "Europe/Riga": "LV",
  "Europe/Vilnius": "LT", "Asia/Nicosia": "CY", "Europe/Malta": "MT", "Europe/Zagreb": "HR",
  "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Qatar": "QA", "Asia/Kuwait": "KW",
  "Asia/Muscat": "OM", "Asia/Bahrain": "BH", "Asia/Baghdad": "IQ", "Asia/Amman": "JO",
  "Asia/Beirut": "LB", "Asia/Jerusalem": "IL", "Asia/Tel_Aviv": "IL",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA",
  "America/Winnipeg": "CA", "America/Halifax": "CA", "America/St_Johns": "CA",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU",
  "Australia/Perth": "AU", "Australia/Adelaide": "AU", "Australia/Darwin": "AU", "Australia/Hobart": "AU",
  "Pacific/Auckland": "NZ", "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY",
  "Asia/Jakarta": "ID", "Asia/Makassar": "ID", "Asia/Jayapura": "ID",
  "Asia/Manila": "PH", "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN", "Asia/Saigon": "VN",
  "Asia/Dhaka": "BD", "Asia/Karachi": "PK", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP",
  "Asia/Yangon": "MM", "Asia/Rangoon": "MM",
  "Asia/Shanghai": "CN", "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW",
  "America/Sao_Paulo": "BR", "America/Mexico_City": "MX", "America/Argentina/Buenos_Aires": "AR",
  "America/Buenos_Aires": "AR", "America/Santiago": "CL", "America/Bogota": "CO",
  "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Cairo": "EG",
  "Africa/Accra": "GH", "Africa/Casablanca": "MA", "Africa/Dar_es_Salaam": "TZ", "Africa/Kampala": "UG",
  "Europe/Istanbul": "TR", "Europe/Moscow": "RU", "Europe/Kyiv": "UA", "Europe/Kiev": "UA",
  "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Budapest": "HU", "Europe/Bucharest": "RO",
  "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Zurich": "CH",
  "Asia/Almaty": "KZ", "Asia/Tashkent": "UZ", "Asia/Baku": "AZ", "Asia/Tbilisi": "GE",
};

// Detects the user's country — no location permission prompt is ever shown.
// Priority: 1) device timezone (auto-set by OS/network, reflects actual geography), which
// correctly disambiguates phones whose display LANGUAGE is a generic "English (United
// States)" locale even though the device is physically elsewhere. 2) device locale region
// code as a fallback. 3) "US" as a last resort if neither signal is available (e.g. some
// headless web/server-rendering contexts).
export function detectDeviceCountry(): string {
  try {
    const tz =
      Localization.getCalendars?.()?.[0]?.timeZone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_COUNTRY[tz]) return TIMEZONE_COUNTRY[tz];
  } catch {}
  try {
    const locales = Localization.getLocales();
    const region = locales?.[0]?.regionCode;
    if (region) return region.toUpperCase();
  } catch {}
  return "US";
}
