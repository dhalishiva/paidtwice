// Deterministic synthetic AP export with planted duplicates of every kind.
// Used for the "try it with sample data" button and for the engine tests.
// All company names are fictional.

export interface SampleRow {
  vendorId: string;
  vendor: string;
  type: "Bill" | "Vendor Credit";
  billNo: string;
  billDate: number; // days since epoch
  paidDate: number | null;
  amountCents: number;
  memo: string;
  plant?: { kind: string; group: number };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const d0 = Math.round(Date.UTC(2025, 0, 1) / DAY);

interface VendorDef {
  id: string;
  name: string;
  scheme: (n: number) => string;
  kind: "monthly" | "weekly" | "random";
  min: number;
  max: number;
  perYear: number;
  fixed?: number;
  memo: string;
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

const VENDORS: VendorDef[] = [
  { id: "V1001", name: "Northwind Traders Ltd", scheme: (n) => `NW-25-${n}`, kind: "random", min: 300, max: 6500, perYear: 70, memo: "Stock purchase" },
  { id: "V1002", name: "Contoso Facilities Inc", scheme: (n) => `INV-${pad(n, 6)}`, kind: "random", min: 150, max: 4200, perYear: 60, memo: "Facilities maintenance" },
  { id: "V1003", name: "Fabrikam Electrical Supply", scheme: (n) => `${n}`, kind: "random", min: 40, max: 2800, perYear: 110, memo: "Electrical parts" },
  { id: "V1004", name: "Tailspin Courier Services", scheme: (n) => `TCS${n}`, kind: "random", min: 60, max: 1900, perYear: 140, memo: "Courier" },
  { id: "V1005", name: "Adatum Cloud Hosting", scheme: (n) => `ADH-${n}`, kind: "monthly", min: 0, max: 0, perYear: 12, fixed: 248_900, memo: "Hosting subscription" },
  { id: "V1006", name: "Litware Office Products", scheme: (n) => `LOP${pad(n, 5)}`, kind: "random", min: 25, max: 950, perYear: 120, memo: "Office supplies" },
  { id: "V1007", name: "Proseware Consulting Group", scheme: (n) => `PCG-2025-${pad(n, 3)}`, kind: "random", min: 2500, max: 18500, perYear: 26, memo: "Consulting services" },
  { id: "V1008", name: "Woodgrove Commercial Cleaning", scheme: (n) => `WCC${n}`, kind: "weekly", min: 0, max: 0, perYear: 52, fixed: 46_500, memo: "Weekly cleaning" },
  { id: "V1009", name: "Alpine Ridge Property Holdings", scheme: (n) => `AR-${n}`, kind: "monthly", min: 0, max: 0, perYear: 12, fixed: 1_250_000, memo: "Office rent" },
  { id: "V1010", name: "Bluewater Freight Co", scheme: (n) => `BWF/${n}`, kind: "random", min: 200, max: 3600, perYear: 90, memo: "Freight" },
  { id: "V1011", name: "Coho Packaging Ltd", scheme: (n) => `CP-${n}`, kind: "random", min: 120, max: 5200, perYear: 64, memo: "Packaging" },
  { id: "V1012", name: "Fourth Coffee Supply", scheme: (n) => `FC${n}`, kind: "random", min: 45, max: 380, perYear: 48, memo: "Pantry" },
  { id: "V1013", name: "Relecloud Software", scheme: (n) => `RS-${n}`, kind: "monthly", min: 0, max: 0, perYear: 12, fixed: 189_000, memo: "Software licences" },
  { id: "V1014", name: "Wide World Importers", scheme: (n) => `WWI${pad(n, 7)}`, kind: "random", min: 800, max: 14_000, perYear: 40, memo: "Imported goods" },
  { id: "V1015", name: "Humongous Insurance", scheme: (n) => `HI-${n}`, kind: "monthly", min: 0, max: 0, perYear: 12, fixed: 412_575, memo: "Insurance premium" },
  { id: "V1016", name: "Lucerne Publishing", scheme: (n) => `LP${n}`, kind: "random", min: 90, max: 1600, perYear: 30, memo: "Printing" },
  { id: "V1017", name: "Kingfisher Plumbing & Heating", scheme: (n) => `K${n}`, kind: "random", min: 150, max: 7400, perYear: 34, memo: "Plumbing repairs" },
  { id: "V1018", name: "Granite Peak Security", scheme: (n) => `GPS-${n}`, kind: "monthly", min: 0, max: 0, perYear: 12, fixed: 320_000, memo: "Security services" },
  { id: "V1019", name: "Silverline Telecom", scheme: (n) => `SLT${n}`, kind: "monthly", min: 0, max: 0, perYear: 12, fixed: 98_744, memo: "Telecom" },
  { id: "V1020", name: "Evergreen Landscaping Co", scheme: (n) => `EL-${n}`, kind: "random", min: 300, max: 2400, perYear: 28, memo: "Grounds" },
  { id: "V1021", name: "Ironclad Machine Parts", scheme: (n) => `IMP${n}`, kind: "random", min: 70, max: 9800, perYear: 85, memo: "Machine parts" },
  { id: "V1022", name: "Summit Staffing Partners", scheme: (n) => `SSP-${n}`, kind: "random", min: 1200, max: 16_000, perYear: 52, memo: "Temporary staff" },
  { id: "V1023", name: "Copperleaf Printing", scheme: (n) => `CLP${n}`, kind: "random", min: 60, max: 2200, perYear: 36, memo: "Print jobs" },
  { id: "V1024", name: "Trey Research Labs", scheme: (n) => `TRL-${n}`, kind: "random", min: 500, max: 12_000, perYear: 18, memo: "Lab testing" },
  { id: "V1025", name: "VanArsdel Ltd", scheme: (n) => `VA${n}`, kind: "random", min: 100, max: 4800, perYear: 44, memo: "Components" },
  { id: "V1026", name: "Wingtip Toys", scheme: (n) => `WT-${n}`, kind: "random", min: 50, max: 2100, perYear: 30, memo: "Promotional items" },
  { id: "V1027", name: "Consolidated Messenger", scheme: (n) => `CM${n}`, kind: "random", min: 30, max: 650, perYear: 75, memo: "Messenger" },
  { id: "V1028", name: "Margie's Travel", scheme: (n) => `MT-${n}`, kind: "random", min: 180, max: 5600, perYear: 46, memo: "Travel bookings" },
];

/** Duplicate vendor-master records (same supplier set up twice). */
const DUP_VENDORS: Record<string, { id: string; name: string }> = {
  V1001: { id: "V1188", name: "Northwind Traders Limited" },
  V1014: { id: "V1203", name: "Wide World Importers Inc." },
  V1010: { id: "V1240", name: "Bluewater Freight Company" },
};

export function generateSample(seed = 20250101) {
  const rand = mulberry32(seed);
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const money = (min: number, max: number) => {
    // Round-ish amounts happen a lot in real AP; mix them in.
    const raw = min + rand() * (max - min);
    const r = rand();
    if (r < 0.15) return Math.round(raw / 50) * 5000;
    if (r < 0.3) return Math.round(raw) * 100;
    return Math.round(raw * 100);
  };

  const rows: SampleRow[] = [];
  const counters = new Map<string, number>();
  const nextNo = (v: VendorDef) => {
    const n = (counters.get(v.id) ?? between(1000, 48000)) + between(1, 3);
    counters.set(v.id, n);
    return v.scheme(n);
  };

  for (const v of VENDORS) {
    if (v.kind === "monthly") {
      for (let m = 0; m < 12; m++) {
        const bill = Math.round(Date.UTC(2025, m, 1) / DAY);
        rows.push({ vendorId: v.id, vendor: v.name, type: "Bill", billNo: nextNo(v), billDate: bill, paidDate: bill + between(10, 25), amountCents: v.fixed!, memo: v.memo });
      }
    } else if (v.kind === "weekly") {
      for (let w = 0; w < 52; w++) {
        const bill = d0 + 2 + w * 7; // Fridays
        rows.push({ vendorId: v.id, vendor: v.name, type: "Bill", billNo: nextNo(v), billDate: bill, paidDate: bill + 14, amountCents: v.fixed!, memo: v.memo });
      }
    } else {
      for (let i = 0; i < v.perYear; i++) {
        const bill = d0 + between(0, 364);
        rows.push({ vendorId: v.id, vendor: v.name, type: "Bill", billNo: nextNo(v), billDate: bill, paidDate: bill + between(7, 45), amountCents: money(v.min, v.max), memo: v.memo });
      }
    }
  }

  // A few genuine credit notes (not related to duplicates)
  for (let i = 0; i < 25; i++) {
    const v = VENDORS[between(0, VENDORS.length - 1)];
    if (v.kind !== "random") continue;
    const bill = d0 + between(0, 364);
    rows.push({ vendorId: v.id, vendor: v.name, type: "Vendor Credit", billNo: `CR-${between(100, 999)}`, billDate: bill, paidDate: null, amountCents: -money(20, 400), memo: "Returned goods" });
  }

  const randomBills = () => rows.filter((r) => !r.plant && r.type === "Bill" && VENDORS.find((v) => v.id === r.vendorId)?.kind === "random");
  const pick = () => {
    const pool = randomBills();
    return pool[between(0, pool.length - 1)];
  };
  let group = 0;
  const plant = (src: SampleRow, kind: string, overrides: Partial<SampleRow>) => {
    group++;
    src.plant = { kind, group };
    const copy: SampleRow = { ...src, ...overrides, plant: { kind, group } };
    rows.push(copy);
    return copy;
  };

  // 1. Exact duplicates (entered twice, paid twice)
  for (let i = 0; i < 6; i++) {
    const s = pick();
    plant(s, "EXACT", { paidDate: (s.paidDate ?? s.billDate) + between(4, 30) });
  }
  // 2. Same invoice keyed in a different format
  const fromVendor = (id: string) => {
    const pool = randomBills().filter((r) => r.vendorId === id);
    return pool[between(0, pool.length - 1)];
  };
  const later = (s: SampleRow) => (s.paidDate ?? s.billDate) + between(3, 20);
  {
    const a = fromVendor("V1002"); // INV-012345 -> 12345 (prefix and zeros dropped)
    plant(a, "INV_FORMAT", { billNo: a.billNo.replace(/^INV-0*/, ""), paidDate: later(a) });
    const b = fromVendor("V1002"); // INV-012345 -> INV-O12345 (OCR read zero as letter O)
    plant(b, "INV_FORMAT", { billNo: b.billNo.replace(/0/, "O"), paidDate: later(b) });
    const c = fromVendor("V1004"); // TCS41023 -> 41023 (vendor prefix dropped)
    plant(c, "INV_FORMAT", { billNo: c.billNo.replace(/^TCS/, ""), paidDate: later(c) });
    const d = fromVendor("V1001"); // NW-25-1042 -> NW-025-1042
    plant(d, "INV_FORMAT", { billNo: d.billNo.replace("NW-25-", "NW-025-"), paidDate: later(d) });
    const e = pick(); // spacing and case only
    plant(e, "INV_FORMAT", { billNo: e.billNo.replace(/[-/]/g, " ").toLowerCase(), paidDate: later(e) });
  }
  // 3. Keying errors: two digits swapped
  for (let i = 0; i < 3; i++) {
    let s = pick();
    let tries = 0;
    let swapped = s.billNo;
    while (tries++ < 50) {
      const digits = [...s.billNo];
      const positions = digits.map((c, k) => k).filter((k) => /\d/.test(digits[k]) && /\d/.test(digits[k + 1] ?? "") && digits[k] !== digits[k + 1] && k < digits.length - 2);
      if (positions.length) {
        const k = positions[between(0, positions.length - 1)];
        [digits[k], digits[k + 1]] = [digits[k + 1], digits[k]];
        swapped = digits.join("");
        break;
      }
      s = pick();
    }
    plant(s, "INV_TYPO", { billNo: swapped, billDate: s.billDate + between(0, 3), paidDate: (s.paidDate ?? s.billDate) + between(5, 15) });
  }
  // 4. Same invoice under a duplicate vendor record
  for (const vid of Object.keys(DUP_VENDORS)) {
    const pool = randomBills().filter((r) => r.vendorId === vid);
    const s = pool[between(0, pool.length - 1)];
    const dup = DUP_VENDORS[vid];
    plant(s, "CROSS_VENDOR", { vendorId: dup.id, vendor: dup.name, paidDate: (s.paidDate ?? s.billDate) + between(6, 25) });
  }
  // 5. Amount keyed differently: transposed digits, then gross vs net (20% VAT)
  {
    let s = pick();
    while (String(s.amountCents).length < 5 || /(\d)\1/.test(String(s.amountCents).slice(1, 3))) s = pick();
    const str = String(s.amountCents);
    const t = str[0] + str[2] + str[1] + str.slice(3);
    plant(s, "AMOUNT_VARIANT", { amountCents: Number(t), paidDate: (s.paidDate ?? s.billDate) + between(5, 20) });
    let g = pick();
    while (g.amountCents % 1000 !== 0 || g.amountCents < 50_000) g = pick();
    plant(g, "AMOUNT_VARIANT", { amountCents: Math.round(g.amountCents * 1.2), paidDate: (g.paidDate ?? g.billDate) + between(5, 20) });
  }
  // 6. Same vendor, amount and date — vendor re-sent the bill under a new number / no number
  for (let i = 0; i < 3; i++) {
    const s = pick();
    const v = VENDORS.find((x) => x.id === s.vendorId)!;
    plant(s, "SAME_DAY", { billNo: i === 0 ? "" : nextNo(v), paidDate: (s.paidDate ?? s.billDate) + between(2, 12) });
  }
  // 7. Same vendor and amount a few days apart, second one without an invoice number
  for (let i = 0; i < 3; i++) {
    const s = pick();
    plant(s, "NEAR_DATE", { billNo: "", billDate: s.billDate + between(3, 9), paidDate: (s.paidDate ?? s.billDate) + between(8, 20) });
  }
  // 8. Look-alike vendor name, same amount, same day
  {
    const pool = randomBills().filter((r) => r.vendorId === "V1004");
    const s = pool[between(0, pool.length - 1)];
    plant(s, "SIMILAR_VENDOR", { vendorId: "V1299", vendor: "Tailspin Courier Service", billNo: `TC-${between(5000, 9000)}`, paidDate: (s.paidDate ?? s.billDate) + 3 });
  }
  // 9. Duplicates that were caught and reversed with a vendor credit
  for (let i = 0; i < 2; i++) {
    const s = pick();
    const copy = plant(s, "REVERSED", { paidDate: (s.paidDate ?? s.billDate) + between(3, 10) });
    rows.push({ ...copy, type: "Vendor Credit", amountCents: -copy.amountCents, billDate: copy.billDate + between(10, 30), paidDate: null, memo: "Duplicate bill reversed", plant: { kind: "REVERSED_CREDIT", group: copy.plant!.group } });
  }

  rows.sort((a, b) => a.billDate - b.billDate || a.vendor.localeCompare(b.vendor));
  return rows;
}

const fmtDate = (days: number | null) => {
  if (days === null) return "";
  const d = new Date(days * DAY);
  return `${pad(d.getUTCMonth() + 1, 2)}/${pad(d.getUTCDate(), 2)}/${d.getUTCFullYear()}`;
};
const fmtAmount = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const SAMPLE_HEADERS = ["Vendor ID", "Vendor", "Type", "Bill No.", "Bill Date", "Paid Date", "Amount", "Memo"];

export function sampleToGrid(rows: SampleRow[]): string[][] {
  return [
    SAMPLE_HEADERS,
    ...rows.map((r) => [r.vendorId, r.vendor, r.type, r.billNo, fmtDate(r.billDate), fmtDate(r.paidDate), fmtAmount(r.amountCents), r.memo]),
  ];
}

export function sampleToCsv(rows: SampleRow[]): string {
  return sampleToGrid(rows)
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
    .join("\r\n");
}
