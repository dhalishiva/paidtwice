---
slug: find-duplicate-payments-quickbooks-online
title: How to find duplicate payments in QuickBooks Online
description: Use QuickBooks Online's duplicate bill warning, export the right reports to Excel, and find the duplicate payments the warning misses.
---

Duplicate payments in QuickBooks Online rarely come from one big mistake. They come from ordinary ones: a bill entered twice because it arrived by email and again in the mail, a bill paid through **Pay bills** and then again by check or bank transfer, or one supplier set up as two vendors. QuickBooks has a built-in safeguard for the first of those. The others you have to look for.

This guide covers what QuickBooks Online warns you about, which reports to export, and how to work through the export in Excel.

## What QuickBooks Online warns you about

QuickBooks Online can warn you when a bill number has already been used. To check the setting:

1. Select **Settings** (the gear icon), then **Account and settings**.
2. Open the **Advanced** tab and go to **Other preferences**.
3. Turn on **Warn me when I enter a bill number that's already been used for that vendor**. Older help pages call it **Warn if duplicate bill number is used**.
4. Select **Save**, then **Done**.

If it's off, turn it on. It costs nothing and it catches the plainest case: the same vendor's bill number entered twice.

### What the warning doesn't catch

The check is narrow. It compares bill numbers within one vendor, and Intuit's community team has confirmed it won't fire when the same number is entered under a different vendor. That leaves several gaps:

- **Duplicate vendor records.** If one supplier exists as "Acme Supply" and "Acme Supply Co.", a bill under each looks like two different vendors' bills.
- **Bill numbers typed differently.** To the warning, INV-00123, 00123 and 123 are three different numbers. So are 48213 and 48231.
- **Bills with no bill number.** A blank field has nothing to compare.
- **Payments that bypass bills.** A check or expense entered directly, or a bank feed transaction added as a new expense instead of matched to the bill payment, never goes through the bill number check. The separate **Warn if duplicate check number is used** setting covers your own check numbers, not the vendor's invoice number.
- **Anything already in the books.** The warning fires when a bill is entered. Duplicates entered before you switched it on stay where they are.

Intuit has also added automations to Intuit Intelligence, with duplicate-bill flagging among the suggested templates. Intuit's announcement doesn't explain how it decides two bills match, so treat it as an extra net rather than a substitute for a periodic review.

## Which reports to export

For a duplicate review you want every bill and every vendor payment for at least the last 12 months in one spreadsheet. These standard reports cover it:

- **Transaction List by Vendor.** Intuit's own advice for finding duplicate numbers is to run this report for all dates and sort by **Num**, which holds the bill number on bills and the check or reference number on checks and expenses. Use **Customize** to filter **Transaction type** to bills, bill payments, checks and expenses.
- **Bills and Applied Payments.** Shows bills with the payments applied to them, so you can see whether both copies of a bill were actually paid.
- **Bill Payment List.** Every bill payment in one place, which is handy for comparing payment runs.
- **Unpaid Bills.** Worth a look before each payment run, because a duplicate is easiest to deal with before it's paid.

To export a report:

1. Go to **Reports**, then **Standard reports**, and open the report.
2. Set the report period, then use **Customize** for filters and columns.
3. Select **Export/Print**, then **Export to Excel**.

If the file opens with data missing, Excel is in Protected View. Select **Enable Editing**.

## How to spot duplicates in Excel

Start by tidying the export. Delete the title and total rows. If transactions are grouped under vendor headings, add a vendor column and fill it down so every row has a vendor. Then convert the range to a table (Ctrl+T). The examples below assume the date is in column A, vendor in B, transaction type in C, number in D and amount in E.

### Exact repeats

In a spare column, build a key: `=B2&"|"&D2&"|"&E2`. Select the column and use **Conditional Formatting > Highlight Cells Rules > Duplicate Values**. Each highlighted pair has the same vendor, number and amount.

### Numbers written differently

In column F, strip prefixes and punctuation. Adjust the prefixes to the ones your vendors use:

`=SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(UPPER(D2),"INV",""),"-",""),"/","")`

In column G, `=IFERROR(VALUE(F2)&"",F2)` turns 00123 into 123 and leaves most numbers containing letters alone (check any like 12E3, which Excel reads as 12000). Then highlight duplicates on a key of vendor plus column G.

Typos (48213 for 48231) and scanning errors (1O23 for 1023) won't line up this way. Sort by vendor, then amount, instead. A mistyped number usually comes with the right amount, so the two bills land on adjacent rows.

### Same vendor and amount a few days apart

This is how a bill paid through **Pay bills** and again by check or bank transfer shows up. Filter the table to payments (bill payments, checks and expenses), then flag rows where the same vendor and amount appear within seven days:

`=COUNTIFS(B:B,B2,E:E,E2,A:A,">="&A2-7,A:A,"<="&A2+7)>1`

Rent, subscriptions and retainers will appear here legitimately. Set them aside.

### The same invoice under two vendors

Sort the whole list by amount, then date. Look for matching amounts on the same or nearby dates under names that look alike. If you find duplicate vendor records, QuickBooks Online can merge them: open the profile you don't want to keep and choose **Edit > Merge contacts**. Intuit notes that the merge moves past transactions to the profile you keep and can't be undone.

### Amounts keyed differently

When the number matches but the amount doesn't, look at the difference. If the difference in cents divides evenly by 9, two digits were probably transposed. If one amount is 10 or 100 times the other, the decimal point moved. If one is the other plus tax, one copy was entered net and the other gross; compare the ratio with 1.20 for 20% VAT, 1.10 for 10% GST, or your local sales tax rate.

### Confirm before you contact the vendor

For each candidate, open both transactions, compare the attachments, and check the bank statement to see whether money actually left twice. A bank feed transaction that was added instead of matched can make one payment look like two. Intuit's fix is to undo the added transaction and match it to the existing record. That's a bookkeeping correction, not a recovery. Also check whether a vendor credit already offsets the duplicate.

## Where an automated check helps

The Excel routine works, but it's five or six separate passes, each with its own helper column and sort. The passes that get skipped in a busy month are the ones that find what QuickBooks doesn't warn about: reformatted numbers, split vendor records and amounts keyed differently. Running the same checks on every export turns the review into a routine instead of a project. Whatever tool you use, keep the last step manual: confirm against the bank and the vendor before asking for money back.

PaidTwice runs these checks on a QuickBooks Online export. Export your bills or bill payments to Excel or CSV and drop the file into PaidTwice. It looks for exact repeats, reformatted and mistyped bill numbers, the same invoice under two vendor records, amounts keyed differently, and the same vendor and amount a few days apart, and it sets aside duplicates already reversed by a vendor credit. The scan runs entirely in your browser, so the file is never uploaded to a server, and the free scan shows the total at stake and the top findings.

## Sources

- [Intuit Community: alert for duplicate bill numbers](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/is-there-an-alert-in-qbo-to-warn-of-duplicate-invoice-numbers/00/833418)
- [Intuit Community: does QuickBooks Online catch duplicate bills](https://quickbooks.intuit.com/community/reports-and-accounting-5/does-qb-online-catch-duplicate-bill-pay-43797)
- [Intuit Community: the bill number check works per vendor](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/entering-bills-in-a-p-system-and-there-is-no-system-check/00/979239)
- [Intuit Community: duplicate bill and check number settings](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/why-does-online-qb-let-me-enter-exact-invoice-info-same-vendor/00/220954)
- [QuickBooks: Find duplicate transaction numbers](https://quickbooks.intuit.com/learn-support/en-us/help-article/sales-receipts/find-duplicate-transaction-numbers/L6pADBBUJ_US_en_US)
- [Intuit Community: filter a report by transaction type](https://quickbooks.intuit.com/community/reports-98/how-do-you-filter-by-transaction-type-in-a-report-374889)
- [Intuit Community: Bills and Applied Payments report](https://quickbooks.intuit.com/community/reports-and-accounting-5/how-do-i-list-all-a-vendor-s-bill-payments-and-those-bills-to-which-the-payments-were-applied-62795)
- [RetrieverHQ: QuickBooks Online reports list](https://retrieverhq.com/guides/quickbooks-online-reports-list)
- [QuickBooks: Export reports to Excel](https://quickbooks.intuit.com/learn-support/en-us/help-article/report-management/export-reports-excel-quickbooks-online/L7iAoP97n_US_en_US)
- [QuickBooks: Fix duplicate transactions in bank feeds](https://quickbooks.intuit.com/learn-support/en-us/help-article/duplicate-transactions/fix-duplicate-transactions-quickbooks-online-bank-feeds/L1fjxl88f_US_en_US)
- [Intuit Community: merge duplicate vendor profiles](https://quickbooks.intuit.com/community/reports-and-accounting-5/how-do-i-merge-duplicate-vendor-or-contractor-profiles-in-quickbooks-online-38092)
- [QuickBooks: Intuit Intelligence new features](https://quickbooks.intuit.com/r/product-update/intuit-intelligence-new-features/)
- [QuickBooks: Introducing Intuit Intelligence](https://quickbooks.intuit.com/learn-support/en-us/help-article/intuit-assist/introducing-intuit-intelligence/L189976Da_US_en_US)
