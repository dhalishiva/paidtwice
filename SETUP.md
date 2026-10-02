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
- Until Paddle is set up, a buy button first asks the visitor to create an account (you need it to
  unlock them later), then opens the contact form with "Online checkout is being switched on. Leave
  your details and we will send you a secure payment link". Each message is saved in the `leads`
  table. Turn on email alerts (step 1) so you see them.
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
   you verify your domain, add `LEAD_FROM_EMAIL` = `PaidTwice <hello@yourdomain>`. If no alert
   arrives, Supabase → Edge Functions → lead → Logs shows Resend's reason.

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
3. Sign-up does not send a confirmation email: `supabase/functions/signup` creates accounts already
   confirmed and the form signs the person straight in, so the product works without SMTP. The
   dashboard's "Confirm email" switch does not affect this. Requiring confirmation later is a code
   change (drop `email_confirm: true` in the function and add a "check your email" step to the form).

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
     `subscription.activated`, `subscription.canceled`, `subscription.paused`, `subscription.resumed`,
     `subscription.past_due`, `subscription.trialing`, `adjustment.created`, `adjustment.updated`
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
   seconds. Then fully refund the Audit Pass in Paddle: access is removed when the refund is approved
   (a partial refund leaves access in place). Cancel Pro from the account page: it stays active until
   the end of the paid period.
8. **Go live.** Complete Paddle's account verification and website review. Paddle reviews the site on
   your own domain (step 2) and looks for pricing, terms, privacy and refund pages, which are all in
   place. Then put the live values into steps 5 and 6 and redeploy.

### 6. Plans to upgrade before you take money

- **Vercel Pro** ($20 a month): the Hobby plan is for non-commercial use only.
- **Supabase Pro** ($25 a month): free projects are paused after a week with no activity, which would
  stop sign-ins and payment webhooks. Then turn on leaked-password protection (Authentication →
  Sign In / Providers → Email → "Prevent use of leaked passwords"; Pro plan and above).

### 7. Search and analytics

**Google Search Console.** The verification tag is already on every page.

1. Go to search.google.com/search-console → Add property → choose **URL prefix** (not Domain) and
   enter `https://paidtwice.vercel.app/`.
2. Choose the **HTML tag** method and click Verify. If Search Console shows a different token from
   the one in `lib/site.ts`, put the new one in the Vercel variable
   `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and redeploy, then verify again.
3. Sitemaps → enter `sitemap.xml` → Submit. Optionally use URL inspection → Request indexing for the
   home page and the four guides.
4. When you move to your own domain, add a **Domain** property for it as well. Its TXT record goes in
   your domain's DNS (Vercel → Domains → your domain → DNS records → TXT, name `@`).

**Vercel Web Analytics and Speed Insights.** The code is in place; each needs one click.

1. Vercel → project `paidtwice` → Analytics → Enable.
2. Vercel → project `paidtwice` → Speed Insights → Enable.
3. Deployments → ⋯ on the latest production deployment → Redeploy. Data appears within minutes of
   the first visits.

**Google Analytics 4.** The code is in place and switches on when the measurement ID is set.

1. Go to analytics.google.com → Admin → Create → Account. Name it (for example "Dhali Services") and
   keep the data sharing boxes you are comfortable with; none are needed.
2. Create a property "PaidTwice", reporting time zone of your choice, currency US dollar. Fill in the
   business details and objectives (any answers work).
3. Choose platform **Web**: website URL `https://paidtwice.vercel.app`, stream name "PaidTwice". Keep
   Enhanced measurement on. Create the stream and copy the **Measurement ID** (`G-XXXXXXXXXX`).
4. Vercel → Settings → Environment Variables → add `NEXT_PUBLIC_GA_MEASUREMENT_ID` = that ID
   (Production) → Save → redeploy.
5. In Google Analytics → Admin:
   - Data collection and modification → Data retention → set event data retention (2 or 14 months).
     The privacy policy says "at most 14 months".
   - Leave Google signals off (the site also switches it off in code).
   - Account settings → accept the data processing terms (Google Ads Data Processing Terms), which
     makes Google your processor for GDPR purposes.
   - Product links → Search Console links → link the Search Console property.
6. Open the site in a private window, choose Allow on the cookie banner, and check Reports → Realtime.

What visitors see: a cookie banner on public pages with equal "No thanks" and "Allow" buttons. Google
Analytics loads only after Allow and never on the scan page, saved audits, sign-in, account or payment
pages. The privacy policy and security page switch to the wording that describes it automatically.

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
  left off once), the same amount to the same vendor on the same or nearby dates, and look-alike
  vendor records paid the same amount on the same date. Voided and cancelled lines are dropped before
  the checks; duplicates already reversed by a credit note are shown apart. Findings are graded high,
  medium or low; low ones are leads and stay out of the headline total.
- **The no-upload promise** is enforced by the Content Security Policy in `lib/security-headers.ts`:
  the scan, audit, sign-in, account and payment pages (`lib/private-routes.ts`) can only connect to
  this site, Supabase and Paddle, and Google Analytics never runs on them. Saving an audit (paid
  plans) stores the summary and the duplicate rows, never the file.
- **Billing**: Paddle checkout carries the user's id. `supabase/functions/paddle-webhook` verifies the
  signature, `planEvent()` in `supabase/functions/_shared/paddle.ts` decides what the event means, and
  `public.apply_billing_event()` applies it atomically: once per event, in order, with refunds and
  chargebacks taking access back.
- **Server functions** (`supabase/functions`): `signup`, `lead`, `paddle-webhook`, `billing-portal`,
  `delete-account`. They check the caller themselves, so JWT verification is off for all of them
  (`supabase/config.toml` keeps it that way when you deploy with the CLI).
- **Database**: migrations in `supabase/migrations`. Row level security is on for every table; the
  dashboard's recovery totals come from the `audit_summaries` view, which runs with the caller's
  permissions.

## Development

```bash
npm install
cp .env.example .env.local   # Supabase URL and publishable key
npm run dev                  # http://localhost:3000
npm test                     # engine, precision and billing tests
npm run lint                 # type check
npm run sample               # regenerate public/sample/northwind-ap-export-2025.csv
```

Deploy a server function after changing it, with the Supabase CLI (JWT settings come from
`supabase/config.toml`): `supabase functions deploy paddle-webhook --project-ref alytxtpmnohqowvlazai`

Vercel already has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`NEXT_PUBLIC_SITE_URL` for production. Supabase provides `SUPABASE_URL` and the service key to the
server functions by itself.

## Handing the product to a buyer

Everything transfers: the GitHub repository (Settings → Transfer), the Vercel project (Settings →
Transfer), the Supabase project (Project settings → Transfer project, to the buyer's organization)
and the domain. Paddle accounts do not transfer: the buyer connects their own Paddle account by
changing the keys, price IDs and webhook secret above, and existing subscribers have to be moved by
Paddle support or re-subscribed.
