// Precision on realistic clean data: every finding here is a false positive, so high and
// medium findings must stay at (or extremely near) zero. This is the test that protects
// customers from a scary, wrong headline number.

import { describe, expect, it } from "vitest";
import { cleanAp } from "./fixtures/clean-ap";
import { gridToTable } from "../lib/engine/readers";
import { autoMap } from "../lib/engine/mapping";
import { runScan } from "../lib/engine/detect";
import { DEFAULT_SETTINGS } from "../lib/engine/types";

describe("clean ledgers", () => {
  it("40,000 clean rows raise no high or medium findings and finish quickly", () => {
    const grid = cleanAp(40_000, 7);
    const t = gridToTable(grid);
    const t0 = Date.now();
    const r = runScan(t, autoMap(t.headers, t.rows), DEFAULT_SETTINGS);
    const ms = Date.now() - t0;
    const serious = r.findings.filter((f) => !f.reversed && f.confidence !== "low");
    expect(serious.length).toBeLessThanOrEqual(1);
    expect(r.stats.byConfidence.low.count).toBeLessThan(20);
    expect(r.warnings.join(" ")).not.toMatch(/only partly compared/);
    expect(ms).toBeLessThan(15_000);
  }, 120_000);

  it("planted duplicates are found inside a large clean ledger", () => {
    const grid = cleanAp(20_000, 11);
    const body = grid.slice(1);
    // Regular vendors only (the generator's three huge vendors issue hundreds of numbers a day).
    const pool = body.filter((r) => r[0].startsWith("V1") && r[2] === "Bill" && /\d\d$/.test(r[3]));
    const pick = (k: number) => pool[(k * 7919) % pool.length].slice();
    const plants: string[][] = [];
    // An exact duplicate, a reformatted number and a transposed number on the same date.
    const a = pick(1);
    plants.push(a.slice());
    const b = pick(2);
    plants.push([...b.slice(0, 3), b[3].replace(/(\d)(\d)(\D*)$/, "$2$1$3"), ...b.slice(4)]);
    const c = pick(3);
    plants.push([...c.slice(0, 3), `#${c[3]}`, ...c.slice(4)]);
    const t = gridToTable([grid[0], ...body, ...plants]);
    const r = runScan(t, autoMap(t.headers, t.rows), DEFAULT_SETTINGS);
    for (const src of [a, b, c]) {
      const hit = r.findings.find((f) => f.rows.some((row) => row.invoiceNumber === src[3]) && f.rows.length >= 2);
      expect(hit, `planted copy of ${src[3]}`).toBeTruthy();
    }
  }, 120_000);
});
