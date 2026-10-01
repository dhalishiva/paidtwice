// Realistic clean AP payment export generator (no planted duplicates): every finding is a false positive.
// Skewed vendor volumes, a few huge vendors billing the same amounts all year, and invoice numbers
// that climb at each vendor's own pace.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const W1 = "Hartley Blackwood Ashford Kingsley Pembroke Whitmore Caldwell Fairbanks Ravenwood Thornton Merriweather Dunmore Galloway Holbrook Lancaster Montrose Northgate Oakridge Prescott Quimby Redfield Stanhope Tilbury Underhill Vandermeer Westbrook Yardley Zellweger Abernathy Brightwater Coldstream Driftwood Eastlake Foxglove Greystone Highmoor Ironside Juniper Kestrel Larkspur Millbrook Nettlefield Orchard Pinecrest Quarry Riverside Silverton Timberline Upland Valemont Willowdale Amberly Bramble Cobalt Dovetail Ember Flint Granger Harbor Indigo Jasper Keystone Lumen Marlow Nimbus Onyx Paragon Quill Rookwood Sable Tidewater Umber Vantage Wexford Xavier Yew Zephyr".split(" ");
const W2 = "Fasteners Plumbing Electric Freight Packaging Printing Catering Security Staffing Hydraulics Bearings Coatings Lumber Glass Roofing Paving Analytics Software Hosting Telecom Insurance Legal Accounting Uniforms Janitorial Landscaping Signage Fabrication Machining Welding Instruments Chemicals Plastics Textiles Furniture Appliances Logistics Couriers Travel Events Media Marketing Recruiting Training Consulting Engineering Surveying Testing Labs Medical Dental Optical Pharmacy Pest Waste Recycling Storage Moving Towing Auto Tires Fuel Water Gas Power HVAC Elevators Doors Locks Alarms Cameras Cabling Networks Printers Paper Toner Coffee Vending".split(" ");
const SUF = ["Inc", "LLC", "Ltd", "Co", "Corp", "Group", "", "", ""];
const pad = (n: number, w: number) => String(n).padStart(w, "0");
export const HEAD = ["Vendor ID", "Vendor", "Type", "Invoice No", "Invoice Date", "Payment Date", "Amount", "Memo"];

export function cleanAp(n: number, seed = 42, monotonic = true): string[][] {
  const rand = mulberry32(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const day = (x: number) => {
    const t = new Date(Date.UTC(2025, 0, 1) + x * 86400000);
    return `${pad(t.getUTCMonth() + 1, 2)}/${pad(t.getUTCDate(), 2)}/${t.getUTCFullYear()}`;
  };
  const money = (c: number) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const names = new Set<string>();
  const vendors: { id: string; name: string; scheme: (k: number) => string; step: number; fixed: number[]; w: number; next: number }[] = [];
  const schemes: ((k: number) => string)[] = [
    (k) => `${k}`,
    (k) => `INV-${pad(k, 6)}`,
    (k) => `${pad(k, 7)}`,
    (k) => `IN${k}`,
    (k) => `A${k}`,
    (k) => `24-${k}`,
  ];
  for (let i = 0; vendors.length < 3000; i++) {
    const name = `${pick(W1)} ${pick(W2)} ${pick(SUF)}`.trim();
    if (names.has(name)) continue;
    names.add(name);
    const big = vendors.length < 40;
    vendors.push({
      id: `V${10000 + vendors.length}`,
      name,
      scheme: pick(schemes),
      step: big ? 1 + Math.floor(rand() * 40) : 1 + Math.floor(rand() * 4), // their numbering also advances for other customers
      fixed: Array.from({ length: big ? 6 : 2 }, () => pick([2500, 4999, 9900, 12500, 15000, 25000, 50000, 75000, 100000, 125000, 250000])),
      w: 1 / (vendors.length + 1) ** 0.9,
      next: 1000 + Math.floor(rand() * 900000),
    });
  }
  const wsum = vendors.reduce((s, v) => s + v.w, 0);
  const huge = [
    { id: "V0001", name: "FleetCard Fuel Services", amounts: [2500, 5000, 7500, 10000], share: 0.15, next: 700000, step: 1, scheme: (k: number) => `FC${k}` },
    { id: "V0002", name: "Parcel Express", amounts: [895, 1250, 1995, 2450, 3200], share: 0.12, next: 5_000_000, step: 7, scheme: (k: number) => `${k}` },
    { id: "V0003", name: "Summit Staffing Partners", amounts: [144000, 115200, 96000], share: 0.06, next: 10000, step: 3, scheme: (k: number) => `SSP-${k}` },
  ];
  const grid: string[][] = [HEAD];
  const pending: { d0: number; who: any; isHuge: boolean; row: string[] }[] = [];
  while (grid.length + pending.length <= n) {
    const r = rand();
    let acc = 0;
    let row: string[] | null = null;
    for (const h of huge) {
      acc += h.share;
      if (r < acc) {
        const d0 = Math.floor(rand() * 365);
        row = [h.id, h.name, "Bill", "", day(d0), day(d0 + 15), money(pick(h.amounts)), "auto"];
        pending.push({ d0, who: h, isHuge: true, row });
        break;
      }
    }
    if (!row) {
      let x = rand() * wsum;
      let v = vendors[0];
      for (const c of vendors) {
        x -= c.w;
        if (x <= 0) { v = c; break; }
      }
      const d0 = Math.floor(rand() * 365);
      const rr = rand();
      const cents = rr < 0.35 ? pick(v.fixed) : rr < 0.5 ? Math.round(20 + rand() * 5000) * 100 : Math.round(2000 + rand() * 900000);
      const credit = rand() < 0.015;
      row = [v.id, v.name, credit ? "Vendor Credit" : "Bill", credit ? `CN-${Math.floor(rand() * 9000) + 1000}` : "", day(d0), credit ? "" : day(d0 + 30), money(credit ? -Math.min(cents, 50000) : cents), "line"];
      pending.push({ d0, who: v, isHuge: false, row });
    }
  }
  if (monotonic) pending.sort((a, b) => a.d0 - b.d0);
  for (const p of pending) {
    if (p.row[2] !== "Vendor Credit") {
      p.who.next += p.isHuge ? p.who.step : p.who.step;
      p.row[3] = p.who.scheme(p.who.next);
    }
    grid.push(p.row);
  }
  return grid;
}
