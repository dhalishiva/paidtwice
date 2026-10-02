# PaidTwice

Find the invoices you paid twice. PaidTwice checks an accounts payable export (CSV or Excel from
QuickBooks, Xero, NetSuite, Sage, SAP, Dynamics, MYOB and others) for duplicate vendor payments,
including the near-misses an accounting system's own duplicate check lets through. The file is read
and checked in the browser and never uploaded.

Live at https://paidtwice.vercel.app

- **Free:** unlimited scans, the total at stake and the top 3 findings.
- **Audit Pass, $149:** every finding, Excel export, saved audits and recovery tracking for 30 days.
- **Pro, $99 a month or $990 a year:** the same, ongoing.
- **Firm:** quoted, for accountants and outsourced AP teams.

Stack: Next.js 16 (App Router) on Vercel, Supabase (auth, Postgres with row level security, Edge
Functions), Paddle Billing as merchant of record. Detection engine in `lib/engine`, tests in `tests`.

See [SETUP.md](SETUP.md) for the launch checklist, Paddle setup, admin tasks and how it works.

```bash
npm install && cp .env.example .env.local && npm run dev
npm test
```
