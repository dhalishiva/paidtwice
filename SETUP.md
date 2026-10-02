# PaidTwice: setup and launch

PaidTwice finds duplicate vendor payments in an accounts payable export. The file is checked in the
buyer's browser and never uploaded. Free scans show the total at stake and the top 3 findings; the
Audit Pass ($149, 30 days) and Pro ($99 a month or $990 a year) unlock every finding, the Excel export,
saved audits and recovery tracking. Paddle sells the plans as merchant of record, so it charges and
files VAT and US sales tax for you.

| What | Where |
| --- | --- |
| Live site | https://paidtwice.vercel.app |
| Code | https://github.com/dhalishiva/paidtwice (pushes to `main` deploy to production) |
| Hosting | Vercel project `paidtwice` |
| Database, auth, server functions | Supabase project `paidtwice` (ref `alytxtpmnohqowvlazai`, London) |

## What works today

- Scanning, the sample file, accounts, the contact form, guides, legal and security pages.
- Buy buttons send people to the contact form until Paddle is set up ("Online checkout is being
  switched on. Leave your details and we will send you a secure payment link"). Each message is saved
  in the `leads` table. Turn on email alerts (step 1) so you see them.
- You can sell by invoice right away and unlock the buyer by hand (see "Selling before Paddle is live").

## Launch checklist

Do these in order. Steps 1 to 4 take about an hour; Paddle's review (step 5) takes a few days.

### 1. Email alerts for new leads (10 minutes)

1. Create a free account at resend.com and an API key.
2. Supabase → Edge Functions → Secrets, add:
   - `RESEND_API_KEY` = the key
   - `LEAD_NOTIFY_EMAIL` = the address you signed up to Resend with
3. Send a test message from the contact page. Until you verify a domain in Resend, alerts come from
   `onboarding@resend.dev` and can only go to your own Resend address, which is all this needs. After
   you verify your domain, add `LEAD_FROM_EMAIL` = `PaidTwice <hello@yourdomain>`.

### 2. Domain

`paidtwice.com` is taken. `paidtwice.app` was available on 2 Oct 2026 at $9.99 for the first year
($15 a year after) through Vercel; `trypaidtwice.com` was $11.25.

1. Buy it (Vercel → Domains, or any registrar) and add it to the project: Vercel → paidtwice →
   Settings → Domains.
2. Vercel → Settings → Environment Variables: set `NEXT_PUBLIC_SITE_URL` to `https://yourdomain`
   (Production), then redeploy (Deployments → ⋯ → Redeploy). Canonical links, the sitemap and the
   legal pages use it, so search engines index the new domain rather than the vercel.app address.

### 3. Supabase auth settings

1. Authentication → URL Configuration
   - Site URL: `https://yourdomain` (use `https://paidtwice.vercel.app` until you have one)
   - Redirect URLs: `https://yourdomain/**` and `https://paidtwice.vercel.app/**`
2. Password reset emails. Supabase's built-in sender only delivers to members of your Supabase team,
   so customers will not get reset links until you add your own SMTP. With Resend: verify your domain
   in Resend, then Authentication → Emails → SMTP Settings: host `smtp.resend.com`, port `465`, user
   `resend`, password = a Resend API key, sender `no-reply@yourdomain`.
3. Sign-up does not send a confirmation email (accounts are confirmed on creation, so the product works
   without SMTP). Once SMTP works you can switch confirmation on, but the sign-up form would then need a
   "check your email" step; it currently signs the person straight in.

### 4. Business details shown on the site

These appear in the footer, terms, privacy policy and refund policy. Paddle checks that they match
your Paddle account. Set them in Vercel → Environment Variables (Production), then redeploy.

| Variable | Default now | Set it to |
| --- | --- | --- |
| `NEXT_PUBLIC_COMPANY_NAME` | Dhali Services | The legal name on your Paddle account |
| `NEXT_PUBLIC_COMPANY_ADDRESS` | Noida, Uttar Pradesh, India | Your full business address |
| `NEXT_PUBLIC_COMPANY_COUNTRY` | India | Country of that address |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | not set | A mailbox you read, e.g. `support@yourdomain` |

While `NEXT_PUBLIC_SUPPORT_EMAIL` is not set, the legal pages point people to the contact form instead
of an email address.

### 5. Paddle (payments)

Set it up in the sandbox first (sandbox-vendors.paddle.com), test, then repeat with your live account.

1. **Products** (Catalog → Products)
   - "Audit Pass": one-time price, USD 149. Optional custom data on the price: `{"plan":"pass","days":30}`.
   - "PaidTwice Pro": recurring prices USD 99 monthly and USD 990 yearly. Optional custom data:
     `{"plan":"pro"}`.
   - Copy the three price IDs (`pri_...`).
2. **Keys** (Developer tools → Authentication)
   - A client-side token (`test_...` in the sandbox, `live_...` in live).
   - An API key with the permissions `customer.read` and `customer_portal_session.write`.
3. **Webhook** (Developer tools → Notifications → New destination)
   - URL: `https://alytxtpmnohqowvlazai.supabase.co/functions/v1/paddle-webhook`
   - Events: `transaction.completed`, `subscription.created`, `subscription.updated`,
     `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`,
     `adjustment.created`, `adjustment.updated`
   - Copy the destination's secret key.
4. **Default payment link** (Checkout → Checkout settings): `https://yourdomain/pay`
5. **Supabase → Edge Functions → Secrets**

   | Secret | Value |
   | --- | --- |
   | `PADDLE_ENV` | `sandbox` or `production` |
   | `PADDLE_WEBHOOK_SECRET` | the notification destination's secret key |
   | `PADDLE_API_KEY` | the API key |
   | `PADDLE_PRICE_PASS` | Audit Pass price ID |
   | `PADDLE_PRICE_PRO_MONTHLY` | Pro monthly price ID |
   | `PADDLE_PRICE_PRO_YEARLY` | Pro yearly price ID |

6. **Vercel → Environment Variables** (Production), then redeploy

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_PADDLE_ENV` | `sandbox` or `production` |
   | `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | the client-side token |
   | `NEXT_PUBLIC_PADDLE_PRICE_PASS` | Audit Pass price ID |
   | `NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY` | Pro monthly price ID |
   | `NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY` | Pro yearly price ID |

7. **Test in the sandbox.** Create an account on the site, buy each plan with card
   `4242 4242 4242 4242` (any future expiry, CVC `100`). The account should unlock within a few
   seconds. Then refund the Audit Pass in Paddle: access is removed when the refund is approved. Cancel
   Pro from the account page: it stays active until the end of the paid period.
8. **Go live.** Complete Paddle's account verification and website review. Paddle reviews the site on
   your own domain (step 2) and looks for pricing, terms, privacy and refund pages, which are all in
   place. Then put the live values into steps 5 and 6 and redeploy.

### 6. Plans to upgrade before you take money

- **Vercel Pro** ($20 a month): the Hobby plan is for non-commercial use only.
- **Supabase Pro** ($25 a month): free projects are paused after a week with no activity, which would
  stop sign-ins and payment webhooks. Then turn on leaked-password protection
  (https://supabase.com/docs/guides/auth/password-security).

## Selling before Paddle is live

1. Leads arrive by email (step 1) and in the `leads` table (Supabase → Table Editor → leads).
2. Send the buyer a payment link or invoice by any means you like.
3. Unlock their account in Supabase → SQL Editor once they have paid and created an account:

```sql
select public.admin_grant_plan('buyer@company.com', 'pass', 30);   -- Audit Pass for 30 days
select public.admin_grant_plan('buyer@company.com', 'pro', 365);   -- Pro for a year
select public.admin_grant_plan('buyer@company.com', 'free');       -- take access away
```

Useful queries:

```sql
select created_at, email, company, country, topic, message from public.leads order by created_at desc;

select u.email, e.pass_until, e.pro_until, e.pro_status, e.pro_cancel_at, e.note
from public.entitlements e join auth.users u on u.id = e.user_id
where e.pass_until > now() or e.pro_until > now();
```

## One-off: remove the test data

Billing was tested against the live database with a fake user. Run once in the SQL Editor:

```sql
delete from public.billing_events where event_id like 'evt_t%';
delete from public.billing_grants where transaction_id like 'txn_t%';
delete from public.leads where topic = 'e2e-test';
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
```

## How it works

- **Detection** runs in a Web Worker in the browser (`lib/engine`). `mapping.ts` recognises the
  columns, `normalize.ts` cleans invoice numbers and vendor names, and `detect.ts` runs the checks
  listed in `TESTS` in `types.ts`: exact duplicates, invoice numbers formatted differently or mistyped,
  the same invoice under two vendor records, amounts keyed differently (including tax added once and
  left off once), and the same amount to the same vendor on the same or nearby dates. Duplicates
  already reversed by a credit or void are shown apart. Findings are graded high, medium or low; low
  ones are leads and stay out of the headline total.
- **The no-upload promise** is enforced by the Content Security Policy in `next.config.ts`: the page
  can only connect to this site, Supabase and Paddle. Saving an audit (paid plans) stores the summary
  and the duplicate rows, never the file.
- **Billing**: Paddle checkout carries the user's id. `supabase/functions/paddle-webhook` verifies the
  signature, `planEvent()` in `supabase/functions/_shared/paddle.ts` decides what the event means, and
  `public.apply_billing_event()` applies it atomically: once per event, in order, with refunds and
  chargebacks taking access back.
- **Server functions** (`supabase/functions`): `signup`, `lead`, `paddle-webhook`, `billing-portal`,
  `delete-account`. They check the caller themselves, so they are deployed with JWT verification off.
- **Database**: migrations in `supabase/migrations`. Row level security is on for every table.

## Development

```bash
npm install
cp .env.example .env.local   # Supabase URL and publishable key
npm run dev                  # http://localhost:3000
npm test                     # engine, precision and billing tests
npm run lint                 # type check
npm run sample               # regenerate public/sample/northwind-ap-export-2025.csv
```

Deploy a server function after changing it, with the Supabase CLI:
`supabase functions deploy paddle-webhook --no-verify-jwt --project-ref alytxtpmnohqowvlazai`

## Handing the product to a buyer

Everything transfers: the GitHub repository (Settings → Transfer), the Vercel project (Settings →
Transfer), the Supabase project (Project settings → Transfer project, to the buyer's organization)
and the domain. Paddle accounts do not transfer: the buyer connects their own Paddle account by
changing the keys, price IDs and webhook secret above, and existing subscribers have to be moved by
Paddle support or re-subscribed.
