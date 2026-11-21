// Fee Check: reads the bill block of a food / grocery delivery order (OCR text of a screenshot) and splits it into food, fees, taxes,
// discounts and what you paid. Pure functions, no DOM: used by the app and by test/bill.test.mjs.
//
// OCR on these screens misreads the ₹ sign as %, =, F, ¥, $, £, # or a leading 7 or 2 ("₹49.38" -> "749.38"), loses decimal points
// ("₹37.00" -> "3700") and runs struck-out prices into the real ones ("₹1841.00 ₹1732.00" -> "2484400 717352.00"). Each amount gets a
// few candidate readings, and the bill's own arithmetic picks the right ones: item total + charges = grand total, and
// grand total - discounts + round-off = paid.

// what each bill line is (first match wins; order matters: "Pay on delivery fee" before "delivery")
export const KINDS = [
  ['skip', /you saved|saving|savings on|order id|bill summary|invoice|reorder|this is decided|decided &|per item|incl\.? of/i],
  ['grand', /grand\s*total|bill\s*total|order\s*total|total\s*bill|total\s*amount|net\s*total/i],
  ['paid', /^\W*(?:paid|to\s*pay|amount\s*paid|total\s*paid|net\s*payable|you\s*paid|paid\s*via)/i],
  ['round', /round(?:ing)?\s*off|round[- ]off|rounding/i],
  ['item', /item\(?s?\)?\s*total|sub\s*-?\s*total|items?\s*(?:price|value|bill)|total\s*mrp|cart\s*(?:value|total)|^\W*item\s*total/i],
  ['tip', /\btip\b|tip\s*(?:for|to)/i],
  ['donation', /donat|feeding india|charity|contribut/i],
  ['discount', /coupon|discount|offer|promo|cashback|savings applied|voucher|you\s*save|-\s*off\b|credits? used|wallet/i],
  ['cod', /pay\s*on\s*delivery|cash\s*on\s*delivery|\bcod\b|cash\s*handling|cash\s*fee/i],
  ['taxcharges', /gst\s*(?:and|&)\s*(?:restaurant|other)?\s*charges|taxes\s*(?:and|&)\s*charges/i],
  ['tax', /\bgst\b|\btax(?:es)?\b|cgst|sgst|igst|govt/i],
  ['packaging', /packag|packing|bag\s*(?:fee|charge)|carry\s*bag/i],
  ['smallcart', /small\s*(?:cart|order|basket)|low\s*(?:cart|order)|minimum\s*order/i],
  ['surge', /\bsurge\b|\brain\b|late\s*night|night\s*(?:fee|charge)|high\s*demand|\bpeak\b|bad\s*weather|long\s*distance/i],
  ['handling', /handling/i],
  ['platform', /platform|convenience|service\s*(?:fee|charge)/i],
  ['membership', /(?:gold|one\s*lite|swiggy\s*one|\bone\b|pass|membership|subscription)\s*(?:fee|charge|price|plan)?/i],
  ['delivery', /\bdelivery\b|distance\s*fee|partner\s*fee/i],
  ['otherfee', /\bfee\b|\bcharges?\b/i],
];
export const NAMES = { item: 'Food / items', tax: 'Taxes (GST)', taxcharges: 'Taxes & restaurant charges', packaging: 'Packaging', delivery: 'Delivery fee', platform: 'Platform fee',
  cod: 'Pay-on-delivery fee', handling: 'Handling fee', smallcart: 'Small-cart fee', surge: 'Surge / late-night / rain fee', membership: 'Membership fee', otherfee: 'Other fees',
  tip: 'Tip', donation: 'Donation', discount: 'Discounts', round: 'Round-off', grand: 'Grand total', paid: 'Paid' };
export const FEE_KINDS = ['packaging', 'delivery', 'platform', 'cod', 'handling', 'smallcart', 'surge', 'membership', 'otherfee'];
const MONEY_SYM = '₹%=F¥$£#€Rs.:*';

// every amount on a line, each with its possible readings
function amounts(line) {
  const out = []; const re = /(-?\s*)([₹%=F¥$£#€*]|Rs\.?|INR)?\s*(\d[\d,]*(?:[.\-·]\d{2})?)(?![\d])/gi; let m;
  while ((m = re.exec(line))) {
    const neg = /-/.test(m[1]), sym = !!m[2]; let d = m[3].replace(/,/g, '').replace(/[\-·]/g, '.');
    const c = new Set();
    const add = s => { const v = parseFloat(s); if (isFinite(v)) c.add(Math.round(v * 100) / 100); };
    const hasDec = /\.\d{2}$/.test(d);
    if (hasDec) add(d); else { if (d.length >= 3) add(d.slice(0, -2) + '.' + d.slice(-2)); add(d); }
    // a ₹ read as a leading 7 / 2 (or 4 / 3 / 1 now and then)
    const intPart = d.split('.')[0];
    if (!sym && /^[72431]/.test(intPart) && intPart.length >= 2) { const t = d.slice(1); if (/\.\d{2}$/.test(t)) add(t); else if (t.length >= 3) { add(t.slice(0, -2) + '.' + t.slice(-2)); add(t); } }
    out.push({ at: m.index, raw: m[0].trim(), neg, cands: [...c] });
  }
  return out;
}

// the bill lines: kind, label, the charged amount's readings, and the struck-out original (for FREE / reduced fees)
export function lines(text) {
  const rows = []; let all = String(text || '').split(/\n/);
  // read only the bill block when the screen has one (the dishes above it carry prices too)
  const head = all.findIndex(l => /bill\s*(?:summary|details)|payment\s*(?:summary|details)|order\s*summary|price\s*details|bill\s*breakup/i.test(l));
  if (head >= 0) all = all.slice(head + 1);
  for (const raw of all) {
    if (/^\W{0,4}\d+\s*[x×]\s/i.test(raw.trim()) || /^\W{0,6}\(?.\)?\s*\d+\s*[x×]\s/i.test(raw.trim())) continue;   // "1 x Paneer wrap ₹305": a dish, not a charge
    const line = raw.replace(/\s+/g, ' ').trim(); if (!line) continue;
    const kind = (KINDS.find(([, re]) => re.test(line)) || [])[0]; if (!kind || kind === 'skip') continue;
    // the label = text before the first amount; codes like GETOFF200ON1149 aren't amounts
    const clean = line.replace(/\b[A-Z]{2,}[A-Z0-9]*\d+[A-Z0-9]*\b/g, ' ');
    const am = amounts(clean).filter(a => a.cands.some(v => v > 0 || /0\.00|^0$/.test(a.raw)) || /free/i.test(clean));
    const free = /\bfree\b/i.test(clean);
    if (!am.length && !free) continue;
    const label = clean.slice(0, am.length ? am[0].at : clean.search(/free/i)).replace(/[^\p{L}\p{N}&()/ .-]/gu, ' ').replace(/\s+/g, ' ').trim();
    let charged, orig = null;
    if (free) { charged = [0]; orig = am.length ? am[0].cands : null; }
    else if (am.length >= 2 && ['delivery', 'platform', 'handling', 'smallcart', 'surge', 'packaging', 'item', 'otherfee', 'cod'].includes(kind)) { charged = am[am.length - 1].cands; orig = am[0].cands; }
    else charged = am[am.length - 1].cands;
    const neg = kind === 'discount' || am.some(a => a.neg && kind === 'round');
    rows.push({ kind, label: label || NAMES[kind], charged, orig, neg, free, line });
  }
  return rows;
}

// pick one reading per line so the bill adds up
export function readBill(text) {
  const rows = lines(text);
  // one row per kind for totals: the first "item", "grand", "paid"; keep all charge rows
  const first = k => rows.find(r => r.kind === k);
  const item = first('item'), grand = first('grand'), paid = first('paid'), round = first('round');
  const charges = rows.filter(r => ['tax', 'taxcharges', 'tip', 'donation', ...FEE_KINDS].includes(r.kind));
  const discounts = rows.filter(r => r.kind === 'discount');
  const vars = [item, ...charges, ...discounts, grand, paid].filter(Boolean);
  let best = null;
  const total = vars.reduce((n, r) => n * Math.max(1, r.charged.length), 1);
  const pick = idx => {   // evaluate one combination
    const v = new Map(vars.map((r, i) => [r, r.charged[idx[i]] ?? r.charged[0]]));
    const I = item ? v.get(item) : 0, C = charges.reduce((s, r) => s + v.get(r), 0), D = discounts.reduce((s, r) => s + Math.abs(v.get(r)), 0);
    const G = grand ? v.get(grand) : null, P = paid ? v.get(paid) : null;
    let err = 0, n = 0;
    if (G != null && item) { err += Math.abs(I + C - G); n++; }
    const base = G != null ? G : I + C;
    let R = 0;
    if (P != null) { R = P - (base - D); if (Math.abs(R) > 1) err += Math.abs(R) - 1; n++; R = Math.abs(R) <= 1 ? R : 0; }
    return { v, I, C, D, G, P, R, err, n };
  };
  if (total <= 200000) {
    const idx = vars.map(() => 0);
    for (let k = 0; k < total; k++) {
      let q = k; for (let i = 0; i < vars.length; i++) { const L = Math.max(1, vars[i].charged.length); idx[i] = q % L; q = Math.floor(q / L); }
      const r = pick(idx); if (!best || r.err < best.err - 1e-9) best = r; if (best.err < 0.005 && best.n) break;
    }
  } else best = pick(vars.map(() => 0));
  if (item && grand && best.err > 0.05) {
    const G = best.G, C = charges.reduce((s, r) => s + best.v.get(r), 0), I = Math.round((G - C) * 100) / 100;
    if (I > 0) { item.charged = [I, ...item.charged]; item.derived = true; const idx = vars.map(r => (r === item ? 0 : Math.max(0, r.charged.indexOf(best.v.get(r))))); const r2 = pick(idx); if (r2.err < best.err) best = r2; }
  }
  const val = r => best.v.get(r);
  const out = { food: item ? val(item) : null, fees: {}, waived: 0, tax: 0, tip: 0, donation: 0, discounts: 0, round: best.R || 0, grand: best.G, paid: best.P, ok: !!best.n && best.err < 0.05, rows: [] };
  for (const r of charges) {
    const a = val(r);
    if (r.kind === 'tax' || r.kind === 'taxcharges') out.tax += a; else if (r.kind === 'tip') out.tip += a; else if (r.kind === 'donation') out.donation += a; else out.fees[r.kind] = (out.fees[r.kind] || 0) + a;
    if (r.orig) { const o = r.orig.filter(x => x > a).sort((x, y) => x - y)[0]; if (o != null && o - a < 1000) out.waived += o - a; }
    out.rows.push({ kind: r.kind, label: r.label, amount: a, free: r.free });
  }
  for (const r of discounts) out.discounts += Math.abs(val(r));
  if (out.paid == null) out.paid = (out.grand ?? (out.food || 0) + Object.values(out.fees).reduce((s, x) => s + x, 0) + out.tax + out.tip + out.donation) - out.discounts + out.round;
  if (item?.orig) { const o = item.orig.filter(x => x > out.food).sort((x, y) => x - y)[0]; if (o != null) out.itemDiscount = o - out.food; }
  out.feeTotal = Object.values(out.fees).reduce((s, x) => s + x, 0);
  out.extra = out.feeTotal + out.tax;            // on top of the food: fees + taxes (tips and donations are your choice, shown apart)
  for (const k of Object.keys(out)) if (typeof out[k] === 'number') out[k] = Math.round(out[k] * 100) / 100;
  for (const k of Object.keys(out.fees)) out.fees[k] = Math.round(out.fees[k] * 100) / 100;
  return out;
}

// several bills: totals and the membership check
export function summary(bills) {
  const s = { n: bills.length, food: 0, feeTotal: 0, tax: 0, waived: 0, discounts: 0, paid: 0, fees: {} };
  for (const b of bills) {
    s.food += b.food || 0; s.feeTotal += b.feeTotal; s.tax += b.tax; s.waived += b.waived; s.discounts += b.discounts; s.paid += b.paid || 0;
    for (const [k, v] of Object.entries(b.fees)) s.fees[k] = (s.fees[k] || 0) + v;
  }
  for (const k of Object.keys(s)) if (typeof s[k] === 'number') s[k] = Math.round(s[k] * 100) / 100;
  for (const k of Object.keys(s.fees)) s.fees[k] = Math.round(s.fees[k] * 100) / 100;
  return s;
}
