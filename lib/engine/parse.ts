// Value parsing: amounts, currencies and dates in the many shapes AP exports produce.

// ---------------------------------------------------------------------------
// Currencies

const ISO_CODES = [
  "USD", "GBP", "EUR", "AUD", "CAD", "NZD", "CHF", "SEK", "NOK", "DKK", "ISK", "PLN", "CZK", "HUF", "RON", "BGN",
  "JPY", "CNY", "RMB", "HKD", "SGD", "INR", "ZAR", "AED", "SAR", "QAR", "KWD", "BHD", "OMR", "MXN", "BRL", "ARS",
  "CLP", "COP", "PEN", "ILS", "TRY", "KRW", "TWD", "THB", "MYR", "IDR", "PHP", "VND", "NGN", "KES", "EGP", "MAD",
  "PKR", "LKR", "BDT", "UAH", "RUB",
];
const ISO_SET = new Set(ISO_CODES);
const ISO_ALT = ISO_CODES.join("|");
/** An ISO code not glued to other letters ("USD1,234" and "1,234 USD" both match). */
const ISO_IN_TEXT = new RegExp(`(^|[^A-Za-z])(${ISO_ALT})(?![A-Za-z])`, "i");
const ISO_IN_TEXT_ALL = new RegExp(`(^|[^A-Za-z])(${ISO_ALT})(?![A-Za-z])`, "gi");

/** Symbols, longest first so "US$" wins over "S$" and "$". */
const SYMBOLS: [string, string | null][] = [
  ["US$", "USD"], ["USD$", "USD"], ["AU$", "AUD"], ["A$", "AUD"], ["CA$", "CAD"], ["C$", "CAD"], ["NZ$", "NZD"],
  ["HK$", "HKD"], ["S$", "SGD"], ["R$", "BRL"], ["MX$", "MXN"], ["$", "USD"], ["£", "GBP"], ["€", "EUR"],
  ["¥", "JPY"], ["₹", "INR"], ["₩", "KRW"], ["₪", "ILS"], ["₺", "TRY"], ["₱", "PHP"], ["₦", "NGN"], ["₫", "VND"],
  ["zł", "PLN"], ["Kč", "CZK"],
];

const CURRENCY_NAMES: [RegExp, string][] = [
  [/^(us|u\.s\.|american)?\s*dollars?$/i, "USD"],
  [/^euros?$/i, "EUR"],
  [/^(british\s+)?pounds?(\s+sterling)?$|^sterling$/i, "GBP"],
  [/^canadian\s+dollars?$/i, "CAD"],
  [/^australian\s+dollars?$/i, "AUD"],
  [/^new\s+zealand\s+dollars?$/i, "NZD"],
  [/^singapore\s+dollars?$/i, "SGD"],
  [/^hong\s+kong\s+dollars?$/i, "HKD"],
  [/^swiss\s+francs?$/i, "CHF"],
  [/^(japanese\s+)?yen$/i, "JPY"],
  [/^(chinese\s+)?(yuan|renminbi)$/i, "CNY"],
  [/^(indian\s+)?rupees?$/i, "INR"],
  [/^swedish\s+kron(a|or)$/i, "SEK"],
  [/^norwegian\s+kron(e|er)$/i, "NOK"],
  [/^danish\s+kron(e|er)$/i, "DKK"],
  [/^(south\s+african\s+)?rand$/i, "ZAR"],
  [/^(uae\s+|emirati\s+)?dirhams?$/i, "AED"],
  [/^(polish\s+)?zlot(y|ys)$/i, "PLN"],
  [/^mexican\s+pesos?$/i, "MXN"],
  [/^(brazilian\s+)?reais|^(brazilian\s+)?real$/i, "BRL"],
];

/**
 * Turn a currency cell ("usd", "$", "US Dollar", "€") into an ISO code.
 * Returns null when the value is not recognised.
 */
export function normalizeCurrency(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (ISO_SET.has(up)) return up === "RMB" ? "CNY" : up;
  for (const [sym, code] of SYMBOLS) if (s === sym || up === sym.toUpperCase()) return code;
  for (const [re, code] of CURRENCY_NAMES) if (re.test(s)) return code;
  const m = up.match(ISO_IN_TEXT);
  if (m) return m[2] === "RMB" ? "CNY" : m[2];
  return null;
}

/** Find an ISO currency code or symbol inside a raw amount string. */
export function currencyFromAmount(raw: string): string | null {
  const s = String(raw ?? "");
  const iso = s.match(ISO_IN_TEXT);
  if (iso) return iso[2].toUpperCase() === "RMB" ? "CNY" : iso[2].toUpperCase();
  for (const [sym, code] of SYMBOLS) if (s.includes(sym)) return code;
  return null;
}

// ---------------------------------------------------------------------------
// Amounts

const MINUS_CHARS = /[−‒–—﹣－]/g;
const SPACE_CHARS = /[      ]/g;
const APOS_CHARS = /[’ʼ´`]/g;
/** Currency words and symbols that may surround a number. Stripped before parsing. */
const CURRENCY_TOKENS = /US\$|USD\$|AU\$|A\$|CA\$|C\$|NZ\$|HK\$|S\$|R\$|MX\$|\$|£|€|¥|₹|₩|₪|₺|₱|₦|₫|zł|Kč|\bkr\.?(?![A-Za-z])|\bRs\.?(?![A-Za-z])|\bFr\.?(?![A-Za-z])/gi;

/** Detect the decimal separator used in a column of amount strings. */
export function detectDecimalSeparator(values: Iterable<string>): "." | "," {
  let dot = 0;
  let comma = 0;
  let ambiguousDots = 0;
  for (const raw of values) {
    const s = String(raw ?? "").replace(/[^\d.,]/g, "");
    if (!/\d/.test(s)) continue;
    const dots = (s.match(/\./g) || []).length;
    const commas = (s.match(/,/g) || []).length;
    if (dots && commas) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) comma += 2;
      else dot += 2;
      continue;
    }
    if (commas) {
      if (commas > 1) dot += 1; // 1,234,567
      else if (/^\d*,\d{1,2}$/.test(s)) comma += 1; // 12,50
      else if (/^\d{4,},\d+$/.test(s) || /^0,\d+$/.test(s) || /,\d{4,}$/.test(s)) comma += 1; // 1234,567 / 0,500
      else if (/^\d{1,3},\d{3}$/.test(s)) dot += 0.5; // 1,234: thousands comma
      continue;
    }
    if (dots) {
      if (dots > 1) comma += 1; // 1.234.567
      else if (/^\d*\.\d{1,2}$/.test(s)) dot += 1; // 12.50
      else if (/^\d{4,}\.\d+$/.test(s) || /^0\.\d+$/.test(s) || /\.\d{4,}$/.test(s)) dot += 1; // 1234.500 / 0.500 / floats
      else if (/^\d{1,3}\.\d{3}$/.test(s)) ambiguousDots += 1; // 1.234: EU thousands or three decimals
    }
  }
  if (comma > dot) return ",";
  if (dot > comma) return ".";
  // Only "1.234"-shaped values: thousands dots are more common than three-decimal money.
  return ambiguousDots > 0 ? "," : ".";
}

const MAX_CENTS = 1e15;

/**
 * Parse an amount into signed minor units (cents). Handles currency symbols and codes,
 * thousands separators (comma, dot, space, apostrophe), decimal commas, parentheses
 * negatives, leading and trailing minus (SAP), "CR"/"DR" markers and unicode minus signs.
 * Returns null when the value is not an amount.
 */
export function parseAmountCents(raw: unknown, decimal: "." | ","): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  let s = String(raw).trim();
  if (!s || s.length > 64) return null;
  s = s.replace(MINUS_CHARS, "-").replace(SPACE_CHARS, " ").replace(APOS_CHARS, "'");
  // Dates, times and fractions are not amounts.
  if (/[\/:]/.test(s)) return null;

  let negative = false;
  // CR / DR markers (before currency stripping so "CR" is not mistaken for anything else).
  const crdrEnd = s.match(/(^|[^A-Za-z])(CR|DR)\.?$/i);
  if (crdrEnd && crdrEnd.index !== undefined) {
    if (crdrEnd[2].toUpperCase() === "CR") negative = !negative;
    s = s.slice(0, crdrEnd.index + crdrEnd[1].length).trim();
  } else {
    const crdrStart = s.match(/^(CR|DR)\.?(?![A-Za-z])/i);
    if (crdrStart) {
      if (crdrStart[1].toUpperCase() === "CR") negative = !negative;
      s = s.slice(crdrStart[0].length).trim();
    }
  }
  s = s.replace(ISO_IN_TEXT_ALL, (_m, pre: string) => `${pre} `).replace(CURRENCY_TOKENS, " ").trim();
  if (!s) return null;

  // Scientific notation leaks out of spreadsheets (1.2E+05).
  const sci = s.replace(/\s+/g, "");
  if (/^[+-]?\d+(\.\d+)?e[+-]?\d+$/i.test(sci)) {
    const n = Number(sci);
    if (!Number.isFinite(n)) return null;
    const c = Math.round(n * 100);
    return negative ? -c : c;
  }

  // Sign markers: parentheses, leading or trailing minus, leading plus.
  let core = s.replace(/\s+/g, " ");
  if (/^\(.*\)$/.test(core)) {
    negative = !negative;
    core = core.slice(1, -1).trim();
  }
  if (/^-\s*\(.*\)$/.test(core)) return null;
  let signs = 0;
  if (core.startsWith("-")) {
    negative = !negative;
    core = core.slice(1).trim();
    signs++;
  } else if (core.startsWith("+")) {
    core = core.slice(1).trim();
  }
  if (core.endsWith("-")) {
    negative = !negative;
    core = core.slice(0, -1).trim();
    signs++;
  }
  if (signs > 1 || /^\(.*\)$/.test(core)) {
    if (/^\(.*\)$/.test(core) && signs === 0) {
      negative = !negative;
      core = core.slice(1, -1).trim();
    } else return null;
  }
  // Remaining: digits plus separators.
  core = core.replace(/[\s']/g, "");
  if (!/^[\d.,]+$/.test(core) || !/\d/.test(core)) return null;

  const dots = (core.match(/\./g) || []).length;
  const commas = (core.match(/,/g) || []).length;
  let dec: "." | "," | null = null;
  if (dots && commas) {
    dec = core.lastIndexOf(".") > core.lastIndexOf(",") ? "." : ",";
  } else if (dots + commas === 1) {
    const sep = dots ? "." : ",";
    const [intPart, frac] = core.split(sep);
    if (frac.length !== 3) dec = sep; // 12.5, 12.50, 12.5000
    else if (intPart.length > 3 || intPart === "0" || intPart === "") dec = sep; // 1234.500, 0.500
    else dec = sep === decimal ? sep : null; // 1.234: trust the column's separator
  } else if (dots + commas > 1) {
    // One kind repeated: thousands grouping (1.234.567, 1,23,456). A trailing group that
    // is not three digits long is a decimal part (1,234,56 is unusual but seen).
    const sep = dots ? "." : ",";
    const groups = core.split(sep);
    const last = groups[groups.length - 1];
    dec = last.length === 3 ? null : sep;
    if (dec && groups.length > 2) {
      // e.g. "1.234.56": treat everything but the last separator as grouping.
      dec = sep;
    }
  }

  let intPart: string;
  let fracPart = "";
  if (dec) {
    const pos = core.lastIndexOf(dec);
    intPart = core.slice(0, pos);
    fracPart = core.slice(pos + 1);
  } else {
    intPart = core;
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (/[.,]/.test(fracPart)) return null;
  if (!intPart && !fracPart) return null;

  // Round to cents with integer maths (avoids float drift).
  const frac = (fracPart + "000").slice(0, 3);
  let cents = Number(intPart || "0") * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isFinite(cents) || cents > MAX_CENTS) return null;
  return negative && cents !== 0 ? -cents : cents;
}

// ---------------------------------------------------------------------------
// Dates

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
  // German
  januar: 1, jaenner: 1, jan_: 1, februar: 2, marz: 3, maerz: 3, mrz: 3, mai: 5, juni: 6, juli: 7,
  oktober: 10, okt: 10, dezember: 12, dez: 12,
  // French
  janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, juin: 6, juillet: 7, juil: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  // Spanish / Italian / Dutch (common short forms)
  ene: 1, enero: 1, febrero: 2, marzo: 3, abr: 4, abril: 4, mayo: 5, junio: 6, julio: 7, ago: 8, agosto: 8,
  septiembre: 9, set: 9, octubre: 10, noviembre: 11, dic: 12, diciembre: 12, gennaio: 1, febbraio: 2,
  aprile: 4, maggio: 5, giugno: 6, luglio: 7, settembre: 9, ottobre: 10, dicembre: 12, mei: 5, okt_: 10,
  maart: 3, augustus: 8,
};

const WEEKDAY = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i;
const DAY_MS = 86_400_000;

function monthOf(word: string): number | undefined {
  const k = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.$/, "");
  return MONTHS[k];
}

function toDays(y: number, m: number, d: number): number | null {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return null;
  const t = Date.UTC(y, m - 1, d);
  const check = new Date(t);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null; // 31 Feb etc.
  return Math.round(t / DAY_MS);
}

const isoCache = new Map<number, string>();

export function daysToIso(days: number | null): string | null {
  if (days == null) return null;
  let s = isoCache.get(days);
  if (s === undefined) {
    s = new Date(days * DAY_MS).toISOString().slice(0, 10);
    if (isoCache.size < 50_000) isoCache.set(days, s);
  }
  return s;
}

const NUMERIC_DATE = /^(\d{1,4})[\/\-.\s](\d{1,2})[\/\-.\s](\d{1,4})\.?(?:[ T,].*)?$/;

export interface DateOrderGuess {
  order: "DMY" | "MDY" | "YMD";
  /** True when nothing in the column settles day-first versus month-first. */
  ambiguous: boolean;
}

/** Look at every value of a date column and decide between D/M/Y and M/D/Y. */
export function detectDateOrder(values: Iterable<string>, fallback: "DMY" | "MDY"): DateOrderGuess {
  let dmy = 0;
  let mdy = 0;
  let ymd = 0;
  let numeric = 0;
  for (const raw of values) {
    const m = String(raw ?? "").trim().match(NUMERIC_DATE);
    if (!m) continue;
    if (m[1].length === 4) {
      ymd++;
      continue;
    }
    numeric++;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && a <= 31 && b <= 12) dmy++;
    else if (b > 12 && b <= 31 && a <= 12) mdy++;
  }
  if (ymd > numeric) return { order: "YMD", ambiguous: false };
  if (dmy > mdy) return { order: "DMY", ambiguous: false };
  if (mdy > dmy) return { order: "MDY", ambiguous: false };
  return { order: fallback, ambiguous: numeric > 0 };
}

/** Parse a date into days since epoch (UTC). Numeric dates follow `order` strictly. */
export function parseDateDays(raw: unknown, order: "DMY" | "MDY" | "YMD"): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(WEEKDAY, "");

  // ISO and ISO-like: 2025-01-12, 2025/01/12, 2025-01-12T10:00:00Z
  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\.?(?:[ T].*)?$/);
  if (m) return toDays(+m[1], +m[2], +m[3]);

  // Compact YYYYMMDD (SAP)
  m = s.match(/^((?:19|20)\d{2})(\d{2})(\d{2})$/);
  if (m) return toDays(+m[1], +m[2], +m[3]);

  // Numeric with separators: order dependent, no guessing.
  m = s.match(NUMERIC_DATE);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const c = +m[3];
    if (m[3].length === 4 || m[3].length <= 2) {
      if (order === "MDY") return toDays(c, a, b);
      if (order === "DMY") return toDays(c, b, a);
      // YMD chosen but the value is not year-first: fall back to the common reading.
      return toDays(c, b, a) ?? toDays(c, a, b);
    }
    return null;
  }

  // 12-Jan-2025, 12 Jan 2025, 12-JAN-25, 12. März 2025, 12 janvier 2025
  m = s.match(/^(\d{1,2})\.?[\s\-.\/]*([A-Za-zÀ-ÿ]{3,10})\.?[\s\-.\/,]*(\d{2,4})(?:[ T,].*)?$/);
  if (m) {
    const mon = monthOf(m[2]);
    if (mon) return toDays(+m[3], mon, +m[1]);
  }
  // Jan 12, 2025 / January 12th 2025
  m = s.match(/^([A-Za-zÀ-ÿ]{3,10})\.?[\s\-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-]+(\d{2,4})(?:[ T,].*)?$/);
  if (m) {
    const mon = monthOf(m[1]);
    if (mon) return toDays(+m[3], mon, +m[2]);
  }

  // Excel serial date (from CSVs exported without formatting). 1990-01-01..2060-12-31
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 32874 && serial <= 58440) return serial - 25569; // Excel epoch 1899-12-30
  }
  // Epoch milliseconds (some APIs and BI tools)
  if (/^1\d{12}$/.test(s)) {
    const days = Math.floor(Number(s) / DAY_MS);
    return days >= 7305 && days <= 47482 ? days : null; // 1990..2099
  }
  return null;
}
