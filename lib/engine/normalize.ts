// Normalisation of invoice numbers and vendor names, plus string similarity helpers.

const MISSING_INVOICE = new Set([
  "", "NA", "NONE", "NIL", "NULL", "TBC", "TBD", "TBA", "UNKNOWN", "UNK", "NOINVOICE", "NOINV", "NOREF", "MISC",
  "VARIOUS", "X", "XX", "XXX", "0", "00", "000", "0000", "NOTAPPLICABLE", "STATEMENT", "INVOICE", "BILL", "REF",
]);

/** Generic invoice-number prefixes that people add or drop when keying invoices. */
const PREFIX = "(?:INVOICE|INVNO|INV|BILL|REF|DOC|NUM|NO|NR|IN)+";
const PREFIX_BEFORE_DIGIT = new RegExp(`^${PREFIX}(?=\\d)`);
const PREFIX_BEFORE_LOOKALIKE = new RegExp(`^${PREFIX}(?=[OQDILSBZG]\\d)`);

/** Characters OCR engines and tired humans confuse with digits. */
const OCR_MAP: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };

function stripAccents(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export interface InvoiceKeys {
  /** Upper-case, letters and digits only. "INV-00123" -> "INV00123" */
  strict: string;
  /** Prefix-free, OCR-folded, no leading zeros. "INV-00123" -> "123", "1O23" -> "1023". "" when unusable. */
  loose: string;
  /** Digits after a leading letter prefix ("TCS41023" -> "41023"), at least 4 digits, else "". */
  digits: string;
  /** The leading letters that `digits` was taken from ("TCS"), "" when none. */
  prefix: string;
  /** Too short or generic to count as evidence on its own (also true when empty). */
  weak: boolean;
}

const EMPTY_KEYS: InvoiceKeys = { strict: "", loose: "", digits: "", prefix: "", weak: true };

export function invoiceKeys(raw: string): InvoiceKeys {
  const strict = stripAccents(String(raw ?? "").toUpperCase()).replace(/[^\p{L}\p{N}]/gu, "");
  if (MISSING_INVOICE.has(strict) || /^0+$/.test(strict)) return EMPTY_KEYS;
  // A reference with no digits at all ("RENT", "MONTHLY FEE") is a description, not an invoice number.
  if (!/\d/.test(strict)) return { ...EMPTY_KEYS, strict };
  let loose = strict;
  const p = loose.match(PREFIX_BEFORE_DIGIT) || loose.match(PREFIX_BEFORE_LOOKALIKE);
  if (p) loose = loose.slice(p[0].length);
  // Fold look-alike letters only when the value is mostly digits; otherwise
  // alphanumeric invoice schemes ("ABDC-7") would collapse together.
  const digitCount = (loose.match(/\d/g) || []).length;
  if (digitCount >= Math.ceil(loose.length / 2)) {
    loose = loose.replace(/[OQDILSBZG]/g, (c) => OCR_MAP[c] ?? c);
  }
  loose = loose.replace(/^0+(?=.)/, "");
  if (MISSING_INVOICE.has(loose)) return { ...EMPTY_KEYS, strict };
  let digits = "";
  let prefix = "";
  const dm = strict.match(/^(\p{L}*)(\d+)$/u);
  if (dm) {
    const d = dm[2].replace(/^0+/, "");
    if (d.length >= 4 && !isWeakInvoiceKey(d)) {
      digits = d;
      prefix = dm[1];
    }
  }
  return { strict, loose, digits, prefix, weak: isWeakInvoiceKey(loose) };
}

/** A shared invoice key that is too short or too generic to count as evidence on its own. */
export function isWeakInvoiceKey(key: string): boolean {
  if (!key || key.length < 4) return true;
  if (!/\d/.test(key)) return true;
  if (/^(\d)\1+$/.test(key)) return true; // 1111, 9999
  if (/^(19|20)\d{2}$/.test(key)) return true; // a bare year
  if (/^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(key)) return true; // 202503: a year and month
  return false;
}

/** Split an invoice key into a stable prefix and a numeric tail ("SSP5004" -> ["SSP", 5004]). */
export function numericTail(key: string): { prefix: string; n: number } | null {
  const m = key.match(/^(.*?)(\d{2,15})$/);
  if (!m) return null;
  return { prefix: m[1], n: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// Vendors

/** Legal-form words removed from the end of a vendor name. */
const LEGAL_SUFFIXES = new Set([
  "INC", "INCORPORATED", "LLC", "LLP", "LP", "LLLP", "PLLC", "LTD", "LIMITED", "PLC", "CORP", "CORPORATION", "CO",
  "COMPANY", "GMBH", "MBH", "AG", "KG", "KGAA", "OHG", "GBR", "UG", "EV", "SA", "SAS", "SARL", "SRL", "SPA", "SL",
  "SAU", "BV", "NV", "VOF", "PTY", "PTE", "OY", "OYJ", "AB", "AS", "ASA", "APS", "SE", "ULC", "PC", "PA", "LTDA",
  "CIA", "BHD", "SDN", "KK", "NL", "OU", "DOO", "SPZOO", "ZOO", "SP", "SC", "SCS", "IVS", "HF", "EHF", "DAC", "CIC",
]);
/** Legal-form words removed from the start of a vendor name (mostly Eastern European forms). */
const LEADING_LEGAL = new Set(["THE", "OOO", "ООО", "ОАО", "ЗАО", "АО", "ПАО", "ИП", "ТОВ", "PT", "CV", "UAB", "SIA"]);
const CJK_LEGAL = /^(株式会社|有限会社|合同会社)|(株式会社|有限会社|合同会社|股份有限公司|有限责任公司|有限公司|公司)$/g;

/** Words that say little about which vendor it is. */
const GENERIC_TOKENS = new Set([
  "SERVICES", "SERVICE", "GROUP", "SOLUTIONS", "SUPPLY", "SUPPLIES", "INTERNATIONAL", "INTL", "GLOBAL", "HOLDINGS",
  "ENTERPRISES", "ENTERPRISE", "TECHNOLOGIES", "TECHNOLOGY", "TECH", "SYSTEMS", "MANAGEMENT", "CONSULTING",
  "PARTNERS", "ASSOCIATES", "INDUSTRIES", "PRODUCTS", "TRADING", "UK", "US", "USA", "EU", "EUROPE", "NORTH",
  "AMERICA", "AMERICAS", "AUSTRALIA", "CANADA", "LOGISTICS", "DISTRIBUTION", "COMMUNICATIONS", "MEDIA", "DIGITAL",
  "NETWORKS", "ENERGY", "FOODS", "FOOD", "OFFICE", "SVCS", "SVC", "SERV", "SRVCS", "MFG", "MANUFACTURING", "ASSOC",
  "DIST", "BROS", "BROTHERS", "AND", "OF", "THE",
]);

export function normalizeVendor(raw: string): string {
  const base = stripAccents(String(raw ?? "").toUpperCase())
    .replace(/[.'’]/g, "")
    .replace(/[&+]/g, " AND ")
    .replace(CJK_LEGAL, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const tokens = base.split(" ").filter(Boolean);
  while (tokens.length > 1 && LEADING_LEGAL.has(tokens[0])) tokens.shift();
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  const out = tokens.join(" ");
  return out || String(raw ?? "").trim().toUpperCase();
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const range = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const aMatch = new Uint8Array(la);
  const bMatch = new Uint8Array(lb);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, lb);
    for (let j = lo; j < hi; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = 1;
      bMatch[j] = 1;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const m = matches;
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < la && prefix < lb && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const isNumberToken = (t: string) => /^\d+$/.test(t);

/** Similarity of two normalised vendor names, 0..1. */
export function vendorSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const compactA = a.replace(/ /g, "");
  const compactB = b.replace(/ /g, "");
  if (compactA === compactB) return 0.99; // "ACME CORP" vs "ACMECORP"
  const jw = jaroWinkler(compactA, compactB);
  const ta = a.split(" ").filter((t) => !GENERIC_TOKENS.has(t));
  const tb = b.split(" ").filter((t) => !GENERIC_TOKENS.has(t));
  let overlap = 0;
  if (ta.length && tb.length) {
    const setB = new Set(tb);
    const shared = ta.filter((t) => setB.has(t) && (t.length >= 3 || isNumberToken(t))).length;
    overlap = shared / Math.max(ta.length, tb.length);
  }
  let sim = Math.max(jw, 0.92 * overlap);
  // Different trade words ("Oakridge Networks" vs "Oakridge Media") mean different businesses,
  // even though those words are too common to count on their own.
  const ga = a.split(" ").filter((t) => GENERIC_TOKENS.has(t) && t.length > 3);
  const gb = b.split(" ").filter((t) => GENERIC_TOKENS.has(t) && t.length > 3);
  if (sim > 0.84 && ga.length && gb.length && !ga.some((t) => gb.some((u) => jaroWinkler(t, u) >= 0.9))) sim = 0.84;
  if (sim > 0.8) {
    // Numbers name a location or entity ("Store #123" vs "Store #456", "Unit 2041").
    const na = ta.filter(isNumberToken);
    const nb = tb.filter(isNumberToken);
    if ((na.length || nb.length) && na.join(" ") !== nb.join(" ")) sim = Math.min(sim, 0.8);
  }
  // A distinguishing word with no near-match on the other side ("Smith Plumbing" vs
  // "Smith Roofing") means two different businesses, however similar the rest is.
  if (ta.length && tb.length && sim > 0.8) {
    const near = (t: string, u: string) => jaroWinkler(t, u) >= (Math.max(t.length, u.length) <= 6 ? 0.92 : 0.88);
    const unmatched = (x: string[], y: string[]) =>
      x.some((t) => t.length >= 2 && !isNumberToken(t) && !y.some((u) => near(t, u)) && !y.join("").includes(t));
    if (unmatched(ta, tb) || unmatched(tb, ta)) sim = Math.min(sim, 0.8);
  }
  return sim;
}

export type EditKind = "equal" | "transpose" | "substitute" | "insert";

/**
 * Optimal-string-alignment check for "differs by at most one edit".
 * Returns the kind of edit, or null when the strings are further apart.
 */
export function oneEdit(a: string, b: string): EditKind | null {
  if (a === b) return "equal";
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return null;
  if (la === lb) {
    let i = 0;
    while (i < la && a[i] === b[i]) i++;
    if (a.slice(i + 1) === b.slice(i + 1)) return "substitute";
    if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return "transpose";
    return null;
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1) ? "insert" : null;
}

/** All strings one deletion away (plus the string itself): keys sharing one are within one edit. */
export function deletionVariants(s: string): string[] {
  const out = [s];
  for (let i = 0; i < s.length; i++) out.push(s.slice(0, i) + s.slice(i + 1));
  return out;
}

/** Amount relationships that point at a keying error rather than two real invoices. */
export function amountRelation(aCents: number, bCents: number): string | null {
  if (aCents <= 0 || bCents <= 0 || aCents === bCents) return null;
  const [lo, hi] = aCents < bCents ? [aCents, bCents] : [bCents, aCents];
  const sa = String(aCents);
  const sb = String(bCents);
  if (sa.length === sb.length && sa.length >= 3) {
    const kind = oneEdit(sa, sb);
    if (kind === "transpose") return "digits transposed";
  }
  for (const f of [10, 100, 1000]) {
    if (lo * f === hi) return "one amount is exactly 10, 100 or 1,000 times the other (decimal point shifted)";
  }
  if (hi - lo <= Math.max(5, Math.round(hi * 0.002))) return "near-identical amount";
  const ratio = hi / lo;
  const TAX_RATES = [5, 6, 7, 8, 9, 10, 12.5, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  for (const rate of TAX_RATES) {
    const expected = 1 + rate / 100;
    if (Math.abs(ratio - expected) <= 0.0015 * expected) return `differs by ${rate}% tax (gross vs net)`;
  }
  return null;
}

/** Memo words that describe a planned part payment rather than a duplicate. */
export const PARTIAL_HINT =
  /\b(deposit|instal{1,2}ments?|partial|part\s*payment|retention|retainage|progress\s*(payment|billing|claim)|milestone|down\s*payment|advance\s*payment|interim\s*payment|tranche|balance\s*(payment|of|due\s*on\s*completion)|final\s*balance|stage\s*payment)\b|\b\d\s*of\s*\d\b/i;
