---
slug: xero-duplicate-bills
title: "Duplicate bills in Xero: how to find them and why they slip through"
description: How Xero flags possible duplicate bills, why some duplicates still get paid, which reports to export, and a simple review routine.
---

Xero now looks for duplicate bills on its own, which is a real improvement. But the duplicates Xero doesn't flag are the ones that don't look identical: a reference keyed two ways, a bill under a second contact, an amount entered with tax on one copy and without it on the other. This guide covers what Xero checks, where duplicates come from, and a routine for finding the rest.

## What Xero checks today

Since 2024, Xero compares the **contact, reference and amount** of bills and credit notes to flag possible duplicates. When it announced the feature, Xero said the alerts work regardless of how a bill was created, which takes in bills sent in by email and bills created by connected apps.

Where you'll see it:

- A banner above the bills list when there are possible duplicates to review.
- **Review duplicate bills** in the menu on the bills list. In the classic navigation the list is under **Business > Bills to pay**; in Xero's refreshed navigation, bills sit under **Purchases**.
- On the review page you can act on unpaid bills (draft or awaiting payment): keep them all if they aren't duplicates, or delete or void the extra copy.
- Paid duplicates are picked up too, but you open and correct them from the bills list. A paid bill needs its payment removed before it can be voided.

A few limits are worth knowing:

- **The match relies on three fields.** Xero describes the check as a comparison of contact, reference and amount. The duplicates you need to hunt for yourself are the ones where one of those three differs.
- **Repeating bills are excluded.** Xero doesn't identify bills created from a repeating bill template as duplicates. If you have a repeating bill for a supplier and someone also enters that supplier's actual invoice, check the pair yourself.
- **It's a prompt, not a block.** Someone still has to open the review and decide. Some users report that recurring monthly bills crowd the list, which makes it tempting to keep everything without looking.

## Why duplicates still slip through

### The same bill arrives through two channels

Xero gives each organization an email address for sending in bills, and many teams also use a capture tool such as Hubdoc or Dext. If a supplier's invoice reaches both, you get two bills. Each tool's own duplicate check sees only part of the picture:

- Hubdoc's duplicate detection matches documents on supplier, date and amount.
- Dext matches invoices on supplier, total and invoice number, falling back to the date only when the number is missing. It compares items within the same Dext account and doesn't look at what's already been published to your accounting software.

That leaves Xero's own check as the backstop, and it needs both copies to agree on contact, reference and amount. If one copy's reference was read as "INV-1024" and the other typed as "1024", or the capture tool mapped the supplier to a different contact, the pair doesn't match.

### Statements and reminders entered as bills

Suppliers re-send invoices as reminders and send statements listing everything open. When a reminder copy or a statement line is keyed as a new bill, it often carries a different reference, such as a statement date or a reminder number, and sometimes a different total. Pay from invoices, not statements.

### Duplicate contacts

The comparison is per contact. "Acme Ltd" and "ACME Limited" are two contacts, so a bill under each is never compared. Capture tools and manual entry both create them. Xero can merge contacts: in the contacts list, select the duplicate records (leave the one you're keeping unselected), choose **Merge** and confirm. Xero says no transactions are deleted; they move to the contact you keep.

### Amounts entered differently

On a Xero bill, **Amounts are** can be set to tax exclusive, tax inclusive or no tax. Enter the same invoice once each way and the totals differ by the VAT, GST or sales tax, so the amounts no longer match. Transposed digits and a misplaced decimal point have the same effect.

### Payments that bypass the bill

A bill paid outside the normal run, through online banking or by card, should be matched to the bill when the bank line is reconciled. If it's reconciled as a new spend money transaction instead, the bill still shows as awaiting payment, and the next batch payment pays it again. Nothing in the bills list looks duplicated, because only one bill exists.

## Which report or export to use

- **Payable Invoice Detail.** Lists supplier bills, credit notes and overpayments. You can group it by contact and add Gross, Tax, Net and Balance columns. It's the best starting point for a review. Export it to Excel.
- **Bills export.** From the bills list, choose the tab and date range, then use **Export bills** in the menu next to **New bill**. The CSV has a row for every line on every bill, so a three-line bill appears three times. Remove the repeated rows before you look for pairs.
- **Account Transactions.** Run it for your bank accounts to see payments that never went through a bill, such as spend money transactions to suppliers you normally pay by bill. Run it for accounts payable to see bills and payments in date order.
- **Aged Payables Detail.** A quick view of what's open by supplier, useful just before a payment run.

## A review routine that catches the rest

### Before each payment run

- Clear the duplicate review. Look at each group rather than keeping them all in bulk.
- Sort bills awaiting payment by amount, and look for equal amounts under the same or similar contact names.
- Check that anything paid outside the run has been matched to its bill.

### Every month

- Export Payable Invoice Detail for the last 12 months and add a helper column that strips prefixes, spaces, punctuation and leading zeros from the reference. Sort by contact and that cleaned reference.
- Sort by amount and date across all contacts to find the same invoice under two contacts.
- Where the reference matches but the amount doesn't, check whether the difference is the tax, a transposition (divisible by 9 in cents) or a decimal shift.
- Scan Account Transactions on your bank accounts for supplier payments that were never matched to a bill.
- Set aside pairs where a credit note or void already cancels the duplicate.

### Every quarter

- Export your contacts and look for near-duplicate supplier names, then merge them.
- Reconcile statements from your largest suppliers. A credit balance on their side is often the first sign you've paid something twice.

PaidTwice can run these checks on a Xero export. Export Payable Invoice Detail or your bills to Excel or CSV and drop the file into PaidTwice. It looks for exact repeats, references formatted differently, keying errors, the same invoice under two contacts, amounts keyed differently (including gross versus net of tax), and the same supplier and amount a few days apart, and it sets aside duplicates already reversed by a credit note. The scan runs entirely in your browser; the file is never uploaded to a server.

## Sources

- [Xero Product Ideas: duplicate bill detection launch](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/44961229-bills-prompt-an-alert-for-duplicate-purchase-inv)
- [Xero Product Ideas: duplicate warning for emailed bills](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/47393246-bills-duplicate-warning-when-emailing-bills-into)
- [Xero Blog: new features to streamline accounts payable](https://blog.xero.com/product-updates/new-features-help-streamline-accounts-payable/)
- [Xero Central: Review duplicate bills or credit notes](https://central.xero.com/0/article/Review-duplicate-bills-or-credit-notes)
- [AFSL: Xero's new duplicate bill feature](https://www.afsl.nz/xero-tip-of-the-month-the-new-duplicate-bill-feature)
- [Xero Product Ideas: duplicate bill review messages](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/49409297-bills-option-to-customise-or-turn-off-duplicate)
- [Seavor Chartered: Xero navigation update](https://www.seavorchartered.co.uk/xero-navigation-gets-an-upgrade/)
- [Xero Blog: Hubdoc duplicate document detection](https://blog.xero.com/product-updates/hubdoc-duplicate-document-detection/)
- [Dext: how duplicate cost documents are handled](https://help.dext.com/en/articles/216124-how-dext-handles-duplicate-cost-documents)
- [Dext: how two cost items are judged duplicates](https://help.dext.com/en/articles/841387-how-does-dext-decide-two-cost-items-are-duplicates)
- [AFSL: merging duplicate contacts in Xero](https://www.afsl.nz/xero-tip-of-the-month-how-to-merge-duplicate-contact-records)
- [Xero Product Ideas: Payable Invoice Detail report](https://productideas.xero.com/forums/967133-reports-tax/suggestions/45486706-payable-invoice-detail-report-total-invoices-pay)
- [Coupler.io: Xero reports guide](https://blog.coupler.io/xero-reports/)
- [SysCloud: how to export Xero data](https://www.syscloud.com/saas-data-protection-center/xero/how-to-export-xero-data/)
- [Xero Product Ideas: bills export format](https://productideas.xero.com/forums/967139-purchase-orders-bills-inventory/suggestions/46632607-bills-export-summary)
- [MindBridge: Xero accounts payable data](https://support.mindbridge.ai/hc/en-us/articles/360061793893-Xero-Accounts-Payable-Data)
