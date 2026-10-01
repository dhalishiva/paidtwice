import { mkdirSync, writeFileSync } from "node:fs";
import { generateSample, sampleToCsv } from "../lib/sample/generate";

mkdirSync("public/sample", { recursive: true });
const csv = sampleToCsv(generateSample());
writeFileSync("public/sample/northwind-ap-export-2025.csv", csv);
console.log("wrote", csv.split("\n").length - 1, "rows");
