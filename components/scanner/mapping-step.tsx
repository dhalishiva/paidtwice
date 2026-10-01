"use client";

import { useMemo, useState } from "react";
import { FIELD_KEYS, FIELD_LABELS, GROUP_HEADINGS, TESTS, type ColumnMapping, type FieldKey, type ScanSettings } from "@/lib/engine/types";
import { mappingHints, mappingProblems } from "@/lib/engine/mapping";
import { chooseSheet, resetScan, setMapping, setSettings, startScan, useScan } from "@/lib/scan-store";
import { count } from "@/lib/format";

const FIELD_HELP: Record<FieldKey, string> = {
  vendorName: "Needed, unless you map a vendor ID",
  vendorId: "Helps separate vendors with similar names",
  invoiceNumber: "The vendor's invoice or bill number",
  invoiceDate: "Invoice, bill or document date",
  paymentDate: "When it was paid, if the file has it",
  amount: "Required",
  creditAmount: "Only when amounts are split into debit and credit columns",
  invoiceTotal: "Only when the amount column is the amount paid",
  currency: "Only if the file mixes currencies",
  docType: "Bill, credit, payment and so on",
  status: "Void and deleted lines are left out",
  docId: "Your own document or payment number",
  description: "Memo or narrative, shown in results",
};

const MAIN_FIELDS: FieldKey[] = ["vendorName", "vendorId", "invoiceNumber", "invoiceDate", "paymentDate", "amount"];
const OTHER_FIELDS = FIELD_KEYS.filter((k) => !MAIN_FIELDS.includes(k));

const CURRENCIES = ["USD", "GBP", "EUR", "AUD", "CAD", "NZD", "CHF", "SEK", "NOK", "DKK", "SGD", "HKD", "ZAR", "AED", "INR", "JPY"];

export function MappingStep() {
  const { info, mapping, settings, error } = useScan();
  const [headerRow, setHeaderRow] = useState<string>(String(info?.headerLine ?? 1));
  const problems = useMemo(() => mappingProblems(mapping), [mapping]);
  const hints = useMemo(() => mappingHints(mapping), [mapping]);
  if (!info) return null;

  const update = (field: FieldKey, value: string) => {
    const next: ColumnMapping = { ...mapping };
    if (value === "") delete next[field];
    else {
      const col = Number(value);
      // A column can only feed one field: free it from any other field first.
      for (const k of FIELD_KEYS) if (next[k] === col) delete next[k];
      next[field] = col;
    }
    setMapping(next);
  };

  const setS = (patch: Partial<ScanSettings>) => setSettings({ ...settings, ...patch });
  const mappedBy = new Map<number, FieldKey>();
  for (const k of FIELD_KEYS) if (mapping[k] !== undefined && mapping[k]! >= 0) mappedBy.set(mapping[k]!, k);
  const otherMapped = OTHER_FIELDS.filter((k) => mapping[k] !== undefined).length;

  const fieldRow = (field: FieldKey) => (
    <div key={field} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center">
      <label htmlFor={`map-${field}`}>
        <span className="block font-semibold">{FIELD_LABELS[field]}</span>
        <span className="block text-sm text-ink-3">{FIELD_HELP[field]}</span>
      </label>
      <select id={`map-${field}`} className="select" value={mapping[field] ?? ""} onChange={(e) => update(field, e.target.value)}>
        <option value="">Not in this file</option>
        {field === "vendorName" && <option value={GROUP_HEADINGS}>From the vendor headings in the file</option>}
        {info.headers.map((h, i) => {
          const s = String(sample(i));
          return (
            <option key={i} value={i}>
              {h}
              {s ? `  (e.g. ${s.length > 24 ? `${s.slice(0, 24)}…` : s})` : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
  const sample = (col: number) => info.preview.find((r) => String(r[col] ?? "").trim())?.[col] ?? "";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h2">Check the columns</h1>
          <p className="mt-2 text-ink-2">
            <span className="font-semibold text-ink">{info.fileName}</span>, {count(info.rowCount)} lines
            {info.sheets.length > 1 ? `, sheet "${info.sheets[info.sheetIndex]?.name}"` : ""}. Columns were matched automatically. Correct
            anything that looks wrong, then start the scan.
          </p>
        </div>
        <button type="button" className="btn btn-quiet btn-sm" onClick={resetScan}>
          Choose another file
        </button>
      </div>

      {error && (
        <p role="alert" className="error-text mt-6 rounded border border-pencil bg-pencil-wash px-4 py-3">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section aria-labelledby="map-title" className="sheet p-5 sm:p-6">
          <h2 id="map-title" className="h3">
            Columns
          </h2>
          {(info.sheets.length > 1 || info.headerLine > 1) && (
            <div className="mt-4 grid gap-4 border-b border-rule pb-5 sm:grid-cols-2">
              {info.sheets.length > 1 && (
                <label className="field">
                  <span className="label">Sheet</span>
                  <select className="select" value={info.sheetIndex} onChange={(e) => chooseSheet(Number(e.target.value))}>
                    {info.sheets.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name} ({count(s.rows)} rows)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="field">
                <label className="label" htmlFor="header-row">
                  Header row
                </label>
                <div className="flex gap-2">
                  <input
                    id="header-row"
                    className="input w-24"
                    type="number"
                    min={1}
                    value={headerRow}
                    onChange={(e) => setHeaderRow(e.target.value)}
                  />
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => chooseSheet(info.sheetIndex, Math.max(1, Number(headerRow) || 1))}>
                    Use this row
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-2 divide-y divide-rule">{MAIN_FIELDS.map(fieldRow)}</div>
          {mapping.vendorName === GROUP_HEADINGS && (
            <p className="mt-2 text-sm text-ink-2">
              Vendor names are taken from the heading above each group of lines, as in QuickBooks reports grouped by vendor.
            </p>
          )}
          <details className="mt-3 border-t border-rule pt-3" open={otherMapped > 0}>
            <summary className="cursor-pointer font-semibold">
              Other columns{otherMapped ? ` (${otherMapped} matched)` : " (optional)"}
            </summary>
            <div className="divide-y divide-rule">{OTHER_FIELDS.map(fieldRow)}</div>
          </details>
          {problems.length > 0 && (
            <ul className="mt-4 grid gap-1" role="alert">
              {problems.map((p) => (
                <li key={p} className="error-text">
                  {p}
                </li>
              ))}
            </ul>
          )}
          {hints.length > 0 && (
            <ul className="mt-4 grid gap-1 text-sm text-ochre">
              {hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid content-start gap-8">
          <section aria-labelledby="preview-title" className="sheet overflow-hidden">
            <h2 id="preview-title" className="h3 px-5 pt-5">
              First lines of your file
            </h2>
            <p className="px-5 pt-1 text-sm text-ink-2">Shown here only. Header on line {info.headerLine}.</p>
            <div className="mt-4 overflow-x-auto border-t border-rule">
              <table className="ledger text-[0.8125rem]">
                <thead>
                  <tr>
                    {info.headers.map((h, i) => (
                      <th key={i} scope="col" className={mappedBy.has(i) ? "" : "!text-ink-3"}>
                        <span className="block">{h}</span>
                        <span className={`block text-[0.75rem] font-semibold ${mappedBy.has(i) ? "text-ink" : "text-ink-3"}`}>
                          {mappedBy.has(i) ? FIELD_LABELS[mappedBy.get(i)!] : "Not used"}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {info.preview.map((row, r) => (
                    <tr key={r}>
                      {info.headers.map((_, c) => (
                        <td key={c} className={`num whitespace-nowrap ${mappedBy.has(c) ? "" : "text-ink-3"}`}>
                          {String(row[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <details className="sheet p-5 sm:p-6">
            <summary className="cursor-pointer font-bold">Scan settings</summary>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="field">
                <span className="label">Close dates window (days)</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={120}
                  value={settings.nearDateWindowDays}
                  onChange={(e) => setS({ nearDateWindowDays: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })}
                />
                <span className="hint">Same vendor and amount within this many days.</span>
              </label>
              <label className="field">
                <span className="label">Ignore amounts below</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="1"
                  value={settings.minAmount}
                  onChange={(e) => setS({ minAmount: Math.max(0, Number(e.target.value) || 0) })}
                />
                <span className="hint">Leave out small charges such as bank fees.</span>
              </label>
              <label className="field">
                <span className="label">Date format</span>
                <select className="select" value={settings.dateOrder} onChange={(e) => setS({ dateOrder: e.target.value as ScanSettings["dateOrder"] })}>
                  <option value="auto">Detect automatically</option>
                  <option value="MDY">Month first (03/31/2025)</option>
                  <option value="DMY">Day first (31/03/2025)</option>
                  <option value="YMD">Year first (2025-03-31)</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Decimal separator</span>
                <select
                  className="select"
                  value={settings.decimalSeparator}
                  onChange={(e) => setS({ decimalSeparator: e.target.value as ScanSettings["decimalSeparator"] })}
                >
                  <option value="auto">Detect automatically</option>
                  <option value=".">Point (1,234.56)</option>
                  <option value=",">Comma (1.234,56)</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Each row is</span>
                <select className="select" value={settings.lineItems} onChange={(e) => setS({ lineItems: e.target.value as ScanSettings["lineItems"] })}>
                  <option value="auto">Detect automatically</option>
                  <option value="separate">One bill, invoice or payment</option>
                  <option value="combine">One line of a bill (combine lines)</option>
                </select>
                <span className="hint">Bills exported line by line, as Xero does, are combined first.</span>
              </label>
              <label className="field">
                <span className="label">Currency if the file has none</span>
                <select className="select" value={settings.defaultCurrency} onChange={(e) => setS({ defaultCurrency: e.target.value })}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="mt-6">
              <legend className="label">Checks to run</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {TESTS.map((t) => (
                  <label key={t.code} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[#14213d]"
                      checked={settings.tests[t.code]}
                      onChange={(e) => setS({ tests: { ...settings.tests, [t.code]: e.target.checked } })}
                    />
                    <span>
                      <span className="block font-semibold">{t.name}</span>
                      <span className="block text-sm text-ink-3">{t.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button type="button" className="btn btn-primary" disabled={problems.length > 0} onClick={startScan}>
          Scan {count(info.rowCount)} lines
        </button>
        <span className="text-sm text-ink-2">Runs on your computer. Large files take a few seconds.</span>
      </div>
    </div>
  );
}
