import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

// The social preview: the product's own idea in one picture. Two lines of an ordinary bill
// list, bracketed in red pencil as the same invoice paid twice.

export const alt = "PaidTwice: find the invoices you paid twice. Two ledger lines bracketed in red as the same invoice.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#14213d";
const INK2 = "#46536e";
const PAPER = "#fbfcf9";
const LEDGER = "#eef5ea";
const RULE = "#c9dcc2";
const GREEN = "#2f5f35";
const PENCIL = "#c2362b";
const WASH = "#fbe7e3";

const ROWS = [
  { v: "Fabrikam Electrical", inv: "30418", d: "3 Mar", a: "612.40" },
  { v: "Contoso Facilities", inv: "INV-004417", d: "4 Mar", a: "4,850.00", hit: true },
  { v: "Tailspin Courier", inv: "TCS41023", d: "6 Mar", a: "186.25" },
  { v: "Contoso Facilities", inv: "4417", d: "11 Mar", a: "4,850.00", hit: true },
];

async function font(weight: 400 | 700 | 800) {
  const file = path.join(
    process.cwd(),
    "node_modules/@fontsource/atkinson-hyperlegible-next/files",
    `atkinson-hyperlegible-next-latin-${weight}-normal.woff`,
  );
  return readFile(file);
}

export default async function OgImage() {
  const [regular, bold, heavy] = await Promise.all([font(400), font(700), font(800)]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, fontFamily: "Atkinson", padding: "64px 72px" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 520, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, fontWeight: 800, color: INK, letterSpacing: -0.5 }}>
            <svg width="48" height="34" viewBox="0 0 34 24">
              <path d="M2.5 12.5l6 6.5L21 3.5" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12.5 12.5l6 6.5L31 3.5" fill="none" stroke={PENCIL} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PaidTwice
          </div>
          <div style={{ display: "flex", marginTop: 54, fontSize: 68, lineHeight: 1.04, fontWeight: 800, color: INK, letterSpacing: -1.5 }}>
            Find the invoices you paid twice.
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 27, lineHeight: 1.35, color: INK2 }}>
            Duplicate payment checks for AP teams. Your file is scanned in your browser and never uploaded.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 56, marginTop: 20, width: 500 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "#ffffff",
              border: `2px solid ${RULE}`,
              borderRadius: 6,
              boxShadow: "0 24px 48px -30px rgba(20,33,61,0.45)",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", padding: "16px 20px", fontSize: 21, fontWeight: 700, color: GREEN }}>Bills paid, March</div>
            <div style={{ display: "flex", background: LEDGER, borderTop: `2px solid ${RULE}`, borderBottom: `2px solid ${RULE}`, fontSize: 19, fontWeight: 700, color: GREEN }}>
              <div style={{ display: "flex", width: 210, padding: "10px 20px" }}>Vendor</div>
              <div style={{ display: "flex", width: 140, padding: "10px 12px" }}>Invoice</div>
              <div style={{ display: "flex", width: 110, padding: "10px 12px", justifyContent: "flex-end" }}>Amount</div>
            </div>
            {ROWS.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  background: r.hit ? WASH : "#ffffff",
                  borderBottom: i < ROWS.length - 1 ? `1.5px solid ${RULE}` : "none",
                  fontSize: 21,
                  color: INK,
                }}
              >
                <div style={{ display: "flex", width: 210, padding: "14px 20px" }}>{r.v}</div>
                <div style={{ display: "flex", width: 140, padding: "14px 12px", color: r.hit ? PENCIL : INK, fontWeight: r.hit ? 700 : 400 }}>{r.inv}</div>
                <div style={{ display: "flex", width: 110, padding: "14px 12px", justifyContent: "flex-end", fontWeight: r.hit ? 700 : 400 }}>{r.a}</div>
              </div>
            ))}
            <svg style={{ position: "absolute", right: -30, top: 128 }} width="40" height="132" viewBox="0 0 40 132">
              <path d="M4 4 C 20 4, 28 10, 28 26 L 28 106 C 28 122, 20 128, 4 128" fill="none" stroke={PENCIL} strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 26, gap: 14 }}>
            <div style={{ display: "flex", width: 8, height: 34, background: PENCIL, borderRadius: 4 }} />
            <div style={{ display: "flex", fontSize: 24, color: INK2 }}>
              <span style={{ color: PENCIL, fontWeight: 700 }}>Paid twice:&nbsp;</span>
              <span style={{ color: INK, fontWeight: 800 }}>$4,850.00</span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Atkinson", data: regular, weight: 400, style: "normal" },
        { name: "Atkinson", data: bold, weight: 700, style: "normal" },
        { name: "Atkinson", data: heavy, weight: 800, style: "normal" },
      ],
    },
  );
}
