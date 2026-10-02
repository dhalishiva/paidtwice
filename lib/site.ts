// Site-wide settings. Business details are read from environment variables so the
// operator can change them in Vercel without touching code.

export const SITE = {
  name: "PaidTwice",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://paidtwice.vercel.app").replace(/\/$/, ""),
  tagline: "Find the invoices you paid twice.",
  description:
    "PaidTwice checks your accounts payable export for duplicate payments, including the ones your accounting system's duplicate check misses. The file is scanned in your browser and never uploaded.",
  company: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Dhali Services",
  country: process.env.NEXT_PUBLIC_COMPANY_COUNTRY ?? "India",
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "Noida, Uttar Pradesh, India",
  /** Empty until a real mailbox is configured; pages then point to the contact form instead. */
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  emailConfigured: Boolean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
  legalUpdated: "1 October 2026",
};

export const PRICES = {
  pass: 149,
  proMonthly: 99,
  proYearly: 990,
};

/** Number of findings a free scan shows in full. */
export const FREE_FINDINGS = 3;

export const SYSTEMS = ["QuickBooks", "Xero", "NetSuite", "Sage", "SAP", "Microsoft Dynamics", "MYOB"];

export function listSentence(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
