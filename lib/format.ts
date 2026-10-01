const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function money(cents: number, currency = "USD", opts: { whole?: boolean } = {}): string {
  const key = `${currency}|${opts.whole ? 0 : 2}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: opts.whole ? 0 : 2,
        maximumFractionDigits: opts.whole ? 0 : 2,
      });
    } catch {
      f = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    moneyFormatters.set(key, f);
  }
  return f.format(cents / 100);
}

/** Plain number with thousands separators and two decimals, as in a ledger column. */
export function amount(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}

export function plural(n: number, one: string, many?: string): string {
  return `${count(n)} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-03-04" -> "4 Mar 2025". Unambiguous for US and UK readers alike. */
export function isoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function dateTime(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
