import { normalizeVendor, vendorSimilarity } from "../lib/engine/normalize";
const pairs = [
  ["Smith & Sons Plumbing", "Smith & Sons Roofing"], ["Amazon Web Services", "Amazon Business"],
  ["Tailspin Courier Services", "Tailspin Courier Svcs"], ["Tailspin Courier Services", "Tailspin Courier Service"],
  ["Northwind Traders Ltd", "Northwind Traders Limited"], ["Johnson Controls", "Johnson Matthey"],
  ["Acme Corp", "ACME Corporation"], ["Acme Corp", "Acme Industries Inc"], ["Fabrikam Inc", "Fabrikan Inc"],
  ["Austin Boston Northwind Traders", "Austin Chicago Northwind Traders"], ["Office Depot", "Office Max"],
  ["Grainger", "W.W. Grainger Inc"], ["FedEx", "Fed Ex"], ["DHL Express", "DHL Supply Chain"],
];
for (const [a, b] of pairs) console.log(vendorSimilarity(normalizeVendor(a), normalizeVendor(b)).toFixed(3), a, "|", b);
