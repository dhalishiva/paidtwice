---
slug: sap-duplicate-invoice-check
title: "SAP's duplicate invoice check: how it works and what it misses"
description: How SAP's standard duplicate invoice check works in FI and MIRO, the gaps it leaves, and how to export FBL1N line items for a review.
---

SAP has a standard duplicate invoice check in both Financial Accounting (FI) and Logistics Invoice Verification (LIV). It's worth having, but it's narrow: it looks for an exact match on a short list of fields within one vendor account. Knowing exactly which fields tells you where duplicates get through.

## Where the check is switched on

The check depends on a vendor master indicator, **Chk double inv.** (field LFB1-REPRF, "Check flag for double invoices or credit memos"), set in the vendor's company code data on the payment transactions view. In S/4HANA it's maintained on the business partner, in the supplier's company code data. SAP's S/4HANA Cloud knowledge base calls it **Check Double Invoice**, maintained in the Maintain Business Partner or Manage Supplier Master Data app.

Because the flag is set per vendor and company code, coverage depends on how each vendor was created. A vendor set up without it isn't checked at all. A list of vendor and company code combinations where the field is blank is a quick first thing to ask your master data team for.

## What FI compares

For invoices posted in FI, through FB60 or F-43 for example, SAP documents two rules, depending on whether a reference (the vendor's invoice number, field XBLNR) is entered:

- **With a reference:** company code, vendor, currency, document date and reference.
- **Without a reference:** company code, vendor, currency, document date and amount in document currency.

The amount isn't compared when a reference is present. SAP's knowledge base covers exactly this case: a duplicate warning on two invoices whose amounts differ.

A match raises message F5 117, "Check whether document has already been entered under number ...". It's a warning by default. On-premise and private cloud systems can raise it to an error in FI message control (transaction OBA5, application area F5); SAP's knowledge base says that change isn't possible in S/4HANA Cloud Public Edition.

## What invoice verification compares (MIRO)

For invoices entered against purchase orders in MIRO, SAP's documented comparison is vendor, currency, company code, gross invoice amount, reference and invoice date. In Customizing, under **Materials Management > Logistics Invoice Verification > Incoming Invoice > Set Check for Duplicate Invoices** (transaction OMRDC), you decide whether company code, reference and invoice date are included. Vendor, currency and amount are always compared.

Switching a criterion off widens the net: fewer fields have to match, so you'll catch more duplicates and see more false alarms. If invoice dates are often keyed inconsistently, excluding the date is worth testing.

The LIV message is M8 108, "Check if invoice already entered under accounting doc. no. ...", and its message type can be configured. Three behaviors matter when you review results:

- SAP's documentation says no message is issued if the earlier document was reversed.
- Credit memos and subsequent debits or credits aren't checked, although from S/4HANA 2023 the check can be activated for credit memos in the same Customizing activity.
- SAP has knowledge base articles on invoices created through BAPIs, IDocs, EDI or APIs not being checked (KBA 2389365 for FI and 1859210 for LIV). If many of your invoices arrive through an interface or a capture tool, ask your SAP team to confirm the check runs for them.

## What the standard check misses

Every gap comes from the same design: an exact match on a few fields, within one vendor account.

### The reference is formatted differently

INV-00123, 00123 and 123 are different values to SAP, and so are scanning errors like 1O23 for 1023. SAP's own training material uses a2b3c4 and ab23c4 as an example: with the reference included in the check, one pair of swapped characters lets the second invoice through.

### The reference is missing

If one copy has a reference and the other doesn't, the reference comparison has nothing to match. And when FI falls back to date and amount for an invoice without a reference, a different document date is enough to miss it.

### The invoice date differs

Both FI rules compare the document date, and LIV does unless you've excluded it. A receipt date keyed instead of the invoice date, or day and month swapped (03/04 against 04/03), gets the second copy through.

### The supplier has two vendor accounts

The vendor is always part of the comparison. A duplicate vendor record, or a one-time vendor account used for a supplier that also has its own account, puts the two copies under different vendors, so they're never compared. FI also always compares company code, so the same invoice posted in two company codes isn't flagged there.

### The amount is keyed differently

LIV always compares the gross amount, and FI compares the amount whenever the reference is blank. Transposed digits, a shifted decimal point, or one copy entered net of VAT, GST or sales tax and the other gross will each break the match.

### The warning is acknowledged

A warning only stops a duplicate if the person posting acts on it. Where F5 117 and M8 108 stay as warnings, a busy clerk can post straight past them.

## Exporting vendor line items for a review

The vendor line item display, FBL1N, gives you a workable review file. In S/4HANA, the Fiori app Manage Supplier Line Items (F0712) is the counterpart.

1. Run FBL1N for all vendor accounts, or a range, and the company codes you want to review.
2. Under line item selection, choose **All items** and a posting date range. Twelve to 24 months is a sensible first review.
3. Change the layout to show company code, vendor account, document type, document number, document date, posting date, reference, currency, amount in document currency, clearing document and clearing date.
4. Export with **List > Export > Spreadsheet**, or the export button on the toolbar, and save as XLSX.

## Working through the export

Standard document types help you split the file: KR for vendor invoices, RE for invoices posted through MIRO, KG for vendor credit memos, and KZ or ZP for payments. Many systems use their own types, so check yours. Then:

- **Clean the reference.** Copy it to a helper column, remove prefixes, spaces and punctuation, strip leading zeros, and sort by vendor and cleaned reference.
- **Look across vendors.** Sort by amount and document date to find the same invoice under two vendor accounts.
- **Test amount variants.** For the same vendor and reference with different amounts, a difference divisible by 9 (in cents) suggests transposed digits, a factor of 10 or 100 a shifted decimal, and a ratio equal to one plus the tax rate a net and gross mix-up.
- **Use the clearing document.** Two copies cleared by two different payment documents were paid twice. If one is still open, you can set a payment block on it before the next payment run.
- **Set aside the corrected ones.** Pairs where one invoice was reversed or offset by a credit memo are already dealt with.

PaidTwice can run these checks on an FBL1N export. Save the file as XLSX or CSV and drop it into PaidTwice. It looks for exact duplicates, references formatted differently, keying errors, the same invoice under two vendor accounts, amounts keyed differently, and the same vendor and amount a few days apart, and it sets aside duplicates a credit memo has already reversed. The scan runs entirely in your browser, so the export is never uploaded to a server.

## Sources

- [SAP Datasheet: data element REPRF documentation](https://www.sapdatasheet.org/abap/dtel/reprf.html)
- [SAP KBA 2558307: duplicate invoice check performance](https://userapps.support.sap.com/sap/support/knowledge/en/2558307)
- [SAP Note 305201 summary: check for duplicate invoices](https://www.stechno.net/repository/sap-notes.html?id=305201)
- [SAP KBA 2646346: duplicate invoice check in S/4HANA Cloud](https://userapps.support.sap.com/sap/support/knowledge/en/2646346)
- [SAP KBA 3463526: duplicate check in Create Incoming Invoices](https://userapps.support.sap.com/sap/support/knowledge/en/3463526)
- [SAP KBA 3135711: F5117 from warning to error](https://userapps.support.sap.com/sap/support/knowledge/en/3135711)
- [SAP Datasheet: message F5 117](https://www.sapdatasheet.org/abap/msag/f5-117.html)
- [SAP TCodes: OBA5 Change Message Control](https://www.sap-tcodes.org/tcode/oba5.html)
- [SAP Learning: invoice verification Customizing settings](https://learning.sap.com/courses/invoice-verification-in-sap-s-4hana/adjusting-further-customizing-settings-in-invoice-verification)
- [se80.co.uk: message M8 108](https://www.se80.co.uk/sapmessages/m/m8/m8-108.htm)
- [SAP KBA 2389365: F5117 not raised via BAPI or IDoc](https://userapps.support.sap.com/sap/support/knowledge/en/2389365)
- [SAP KBA 1859210: BAPI, EDI and API duplicate invoice check](https://userapps.support.sap.com/sap/support/knowledge/en/1859210)
- [Michael Management: Fiori apps for GUI transactions](https://sapnow.michaelmanagement.com/blog/sap/gui-transactions-for-s4-hana)
- [The Bricks: pulling SAP data into Excel](https://www.thebricks.com/resources/guide-how-to-pull-data-from-sap-into-excel)
