// "What it catches": each check shown as the two ledger lines it would pair up,
// with the red pencil on whatever makes the second line look different.

type Part = string | { m: string } | { f: string };
type Cell = Part | Part[];

interface Example {
  title: string;
  text: string;
  rows: [Cell, Cell, Cell, Cell][];
}

const EXAMPLES: Example[] = [
  {
    title: "Entered twice",
    text: "The same bill keyed once from the email and again from the paper copy.",
    rows: [
      ["Ironclad Machine Parts", "IMP34438", "2 Sep", "7,244.82"],
      ["Ironclad Machine Parts", "IMP34438", { m: "9 Sep" }, "7,244.82"],
    ],
  },
  {
    title: "Same number, written differently",
    text: "Prefixes, punctuation, leading zeros and scanning slips such as the letter O for a zero are ignored.",
    rows: [
      ["Contoso Facilities", [{ f: "INV-00" }, { m: "4417" }], "4 Mar", "4,850.00"],
      ["Contoso Facilities", { m: "4417" }, "11 Mar", "4,850.00"],
    ],
  },
  {
    title: "One keystroke apart",
    text: "Two digits swapped or one mistyped, same amount. Neighbouring numbers in a vendor's own sequence are left alone.",
    rows: [
      ["Bluewater Freight", ["BWF/", { m: "40" }, "469"], "14 Aug", "3,029.75"],
      ["Bluewater Freight", ["BWF/", { m: "04" }, "469"], "21 Aug", "3,029.75"],
    ],
  },
  {
    title: "One supplier, two vendor records",
    text: "The same invoice booked to a duplicate entry in the vendor master, so no system check ever compares them.",
    rows: [
      [["Wide World Importers ", { f: "V1014" }], "WWI0047030", "3 Feb", "6,319.00"],
      [["Wide World Importers Inc. ", { m: "V1203" }], "WWI0047030", "24 Feb", "6,319.00"],
    ],
  },
  {
    title: "Same invoice, different amount",
    text: "Net on one copy and gross on the other, digits transposed, or the decimal point in the wrong place.",
    rows: [
      ["Coho Packaging", "CP-47039", "10 Nov", "1,000.00"],
      ["Coho Packaging", "CP-47039", "21 Nov", { m: "1,200.00" }],
    ],
  },
  {
    title: "Same day, same amount, new number",
    text: "The vendor sent the bill again with a fresh invoice number and both copies were approved.",
    rows: [
      ["Contoso Facilities", "INV-045529", "8 May", "2,998.46"],
      ["Contoso Facilities", ["INV-045", { m: "618" }], "8 May", "2,998.46"],
    ],
  },
  {
    title: "A few days apart, no number",
    text: "A second payment with the invoice number left blank. Weekly and monthly charges are recognised and set aside.",
    rows: [
      ["Ironclad Machine Parts", "IMP35102", "26 Sep", "8,636.38"],
      ["Ironclad Machine Parts", { m: "(blank)" }, "29 Sep", "8,636.38"],
    ],
  },
  {
    title: "Look-alike vendor names",
    text: "Two near-identical vendor names paid the same amount on the same day.",
    rows: [
      ["Tailspin Courier Services", "TCS48810", "2 Dec", "79.56"],
      [["Tailspin Courier Servic", { m: "e" }], "TC-7731", "2 Dec", "79.56"],
    ],
  },
];

function renderPart(p: Part, i: number) {
  if (typeof p === "string") return <span key={i}>{p}</span>;
  if ("m" in p)
    return (
      <span key={i} className="pencil">
        {p.m}
      </span>
    );
  return (
    <span key={i} className="faint">
      {p.f}
    </span>
  );
}

function renderCell(c: Cell) {
  return Array.isArray(c) ? c.map(renderPart) : renderPart(c, 0);
}

export function Catches() {
  return (
    <div className="grid gap-x-14 gap-y-12 md:grid-cols-2">
      {EXAMPLES.map((ex) => (
        <article key={ex.title}>
          <h3 className="h3">{ex.title}</h3>
          <p className="mt-2 max-w-[34em] text-ink-2">{ex.text}</p>
          <div className="sheet mt-4 overflow-x-auto">
            <table className="ledger text-[0.875rem]">
              <thead>
                <tr>
                  <th scope="col">Vendor</th>
                  <th scope="col">Invoice no.</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="r">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {ex.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap">{renderCell(r[0])}</td>
                    <td className="num whitespace-nowrap">{renderCell(r[1])}</td>
                    <td className="num whitespace-nowrap">{renderCell(r[2])}</td>
                    <td className="num r whitespace-nowrap">{renderCell(r[3])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}
