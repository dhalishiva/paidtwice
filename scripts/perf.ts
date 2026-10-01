const CITIES = ["Austin","Boston","Chicago","Denver","Eugene","Fresno","Galway","Houston","Irvine","Jackson","Kent","Leeds","Madison","Nashville","Oxford","Portland","Quincy","Reno","Salem","Tampa","Utica","Vegas","Wichita","York"];
import { generateSample, sampleToGrid } from "../lib/sample/generate";
import { gridToTable } from "../lib/engine/readers";
import { autoMap } from "../lib/engine/mapping";
import { normalizeTable, detect } from "../lib/engine/detect";
import { DEFAULT_SETTINGS } from "../lib/engine/types";

const N = Number(process.argv[2] || 150000);
const grid: string[][] = [sampleToGrid(generateSample(7))[0]];
let seed = 7;
while (grid.length < N) {
  const g = sampleToGrid(generateSample(++seed)).slice(1);
  for (const r of g) { r[0] = `${r[0]}-${seed}`; r[1] = `${CITIES[seed % CITIES.length]} ${CITIES[Math.floor(seed / CITIES.length) % CITIES.length]} ${r[1]}`; grid.push(r); }
}
let t = Date.now();
const table = gridToTable(grid);
const mapping = autoMap(table.headers, table.rows);
console.log("table+map", Date.now() - t); t = Date.now();
const norm = normalizeTable(table, mapping, DEFAULT_SETTINGS);
console.log("normalize", Date.now() - t); t = Date.now();
const res = detect(norm, DEFAULT_SETTINGS, mapping);
console.log("detect", Date.now() - t, "findings", res.findings.length);
const byTest: Record<string, number> = {};
for (const f of res.findings) byTest[f.test] = (byTest[f.test] || 0) + 1;
console.log(byTest);
