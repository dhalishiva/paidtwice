import { generateSample, sampleToGrid } from "../lib/sample/generate";
import { gridToTable } from "../lib/engine/readers";
import { autoMap } from "../lib/engine/mapping";
import { runScan } from "../lib/engine/detect";
import { DEFAULT_SETTINGS } from "../lib/engine/types";

const rows = generateSample();
const grid = sampleToGrid(rows);
const table = gridToTable(grid);
const mapping = autoMap(table.headers, table.rows);
console.log("mapping", Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, table.headers[v as number]])));
const res = runScan(table, mapping, DEFAULT_SETTINGS);
console.log("rows", rows.length, "stats", JSON.stringify({ ...res.stats, byTest: undefined, skippedReasons: res.stats.skippedReasons }, null, 0));
console.log("detected", res.detected, "warnings", res.warnings);
// Map line -> planted kind
const lineKind = new Map<number, string>();
rows.forEach((r, i) => { if (r.plant) lineKind.set(i + 2, `${r.plant.kind}#${r.plant.group}`); });
const plantedGroups = new Map<string, number[]>();
for (const [line, k] of lineKind) { const arr = plantedGroups.get(k) || []; arr.push(line); plantedGroups.set(k, arr); }
let fp = 0;
for (const f of res.findings) {
  const kinds = [...new Set(f.rows.map((r) => lineKind.get(r.line) || "-"))];
  const planted = kinds.some((k) => k !== "-");
  if (!planted) fp++;
  console.log(`${f.confidence.padEnd(6)} ${f.score.toFixed(2)} ${f.test.padEnd(14)} ${(f.exposureCents/100).toFixed(2).padStart(10)} ${f.reversed ? "REV" : "   "} lines=${f.rows.map((r) => r.line).join(",")} planted=${kinds.join("|")}  ${f.reasons[0]}`);
}
// Which planted groups were missed?
const found = new Set<string>();
for (const f of res.findings) for (const r of f.rows) if (lineKind.has(r.line)) found.add(lineKind.get(r.line)!);
const missed = [...plantedGroups.keys()].filter((k) => !found.has(k) && !k.startsWith("REVERSED_CREDIT"));
console.log("planted groups", plantedGroups.size, "missed", missed, "unplanted findings", fp);
