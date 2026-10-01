// The opening image: an ordinary page of paid bills where the red pencil catches the
// same invoice paid twice. Row heights are fixed so the bracket can be drawn in SVG.

const ROWS: { vendor: string; inv: React.ReactNode; date: string; amount: string; catch?: boolean }[] = [
  { vendor: "Fabrikam Electrical", inv: "30418", date: "3 Mar", amount: "612.40" },
  {
    vendor: "Contoso Facilities",
    inv: (
      <>
        <span className="faint">INV-00</span>
        <span className="hero-mark">4417</span>
      </>
    ),
    date: "4 Mar",
    amount: "4,850.00",
    catch: true,
  },
  { vendor: "Tailspin Courier", inv: "TCS41023", date: "6 Mar", amount: "186.25" },
  { vendor: "Litware Office", inv: "LOP02291", date: "7 Mar", amount: "94.10" },
  { vendor: "Bluewater Freight", inv: "BWF/7712", date: "10 Mar", amount: "1,206.00" },
  { vendor: "Contoso Facilities", inv: <span className="hero-mark">4417</span>, date: "11 Mar", amount: "4,850.00", catch: true },
  { vendor: "Relecloud", inv: "RS-3304", date: "12 Mar", amount: "1,890.00" },
];

export function HeroLedger() {
  return (
    <figure className="relative" aria-labelledby="hero-ledger-caption">
      <div className="sheet relative pr-12 sm:pr-16">
        <p id="hero-ledger-caption" className="flex h-11 items-center px-4 text-sm font-bold text-green-ink sm:px-5">
          Bills paid, March 2025
        </p>
        <table className="ledger hero-ledger table-fixed text-[0.875rem] sm:text-[0.9375rem]">
          <caption className="sr-only">Seven paid bills. Two of them are the same Contoso Facilities invoice, paid on 4 and 11 March.</caption>
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[27%]" />
            <col className="w-[15%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Vendor</th>
              <th scope="col">Invoice no.</th>
              <th scope="col">Paid</th>
              <th scope="col" className="r">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i} className={r.catch ? "catch" : undefined}>
                <td className="truncate">{r.vendor}</td>
                <td className="num truncate">{r.inv}</td>
                <td className="num whitespace-nowrap">{r.date}</td>
                <td className="num r">{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Red pencil bracket joining rows 2 and 6 (header 44px, rows 44px; table starts 44px below the sheet top). */}
        <svg
          className="hero-bracket pointer-events-none absolute right-1 sm:right-3"
          style={{ top: 44 }}
          width="44"
          height="352"
          viewBox="0 0 44 352"
          aria-hidden="true"
        >
          <path
            d="M4 110 C 20 110, 30 114, 31 130 L 32 266 C 31 282, 20 286, 4 286"
            fill="none"
            stroke="#c2362b"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <figcaption className="hero-note mt-4 flex items-start gap-3 pl-1">
        <span aria-hidden="true" className="mt-[3px] h-5 w-1.5 shrink-0 rounded-full bg-pencil" />
        <span className="text-[0.9375rem] leading-snug text-ink-2">
          <strong className="text-pencil-dark">Same invoice, paid twice: </strong>
          <span className="num font-bold text-ink total">$4,850.00</span>. INV-004417 and 4417 are one number once the prefix and zeros
          are dropped.
        </span>
      </figcaption>
    </figure>
  );
}
