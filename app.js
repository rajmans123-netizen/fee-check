// Fee Check: add screenshots of delivery bills; see how much of what you paid was food, fees and taxes, across all of them; and whether
// your membership pays for itself. The screenshots are read in this page (ocr.js) and split by plain rules (bill.js); nothing is sent anywhere.
import { readBill, summary, NAMES, FEE_KINDS } from './bill.js';
import { readText, warmUp } from './ocr.js';
const $ = id => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem('fc.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('fc.' + k, JSON.stringify(v)); } catch { } } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const rs = (n, dec = false) => '₹' + (Math.round((n || 0) * (dec ? 100 : 1)) / (dec ? 100 : 1)).toLocaleString('en-IN', dec ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
function toast(t) { const e = el('div', 'toast', t); document.body.append(e); setTimeout(() => e.remove(), 2600); }
function show(id) { for (const s of ['start', 'reading', 'result']) $(s).hidden = s !== id; }
const S = { bills: [], demo: false };

// ---------------------------------------------------------------- reading screenshots
async function addFiles(files) {
  files = [...files].filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp|heic)$/i.test(f.name)); if (!files.length) return;
  show('reading'); window.scrollTo({ top: 0 });
  let bad = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i], url = URL.createObjectURL(f); $('photo').src = url;
    const tag = files.length > 1 ? `Bill ${i + 1} of ${files.length}: ` : '';
    $('readSay').textContent = tag + 'Getting the reader ready…';
    try {
      const text = await readText(f, (what, p) => { $('readSay').textContent = `${tag}${what}… ${Math.round((p || 0) * 100)}%`; }, 'eng', 1600);
      const b = readBill(text);
      if (b.food == null && !b.feeTotal && !b.tax) { bad++; continue; }
      S.bills.push({ name: `Order ${S.bills.length + 1}`, b });
    } catch (e) { bad++; toast(e.message || 'Could not read that screenshot.'); }
    finally { URL.revokeObjectURL(url); }
  }
  if (!S.bills.length) { show('start'); toast("Couldn't find a bill in that. Screenshot the Bill summary / Bill details part of an order."); return; }
  if (bad) toast(`${bad} screenshot${bad > 1 ? 's' : ''} had no bill in ${bad > 1 ? 'them' : 'it'}. Screenshot the Bill summary part.`);
  render(); show('result'); window.scrollTo({ top: 0, behavior: 'smooth' });
  if (history.state?.v !== 'result') history.pushState({ v: 'result' }, '');
}

// a bill after a number was fixed by hand: add it up again
function recompute(b) {
  b.fees = {}; b.tax = 0; b.tip = 0; b.donation = 0;
  for (const r of b.rows) { if (r.kind === 'tax' || r.kind === 'taxcharges') b.tax += r.amount; else if (r.kind === 'tip') b.tip += r.amount; else if (r.kind === 'donation') b.donation += r.amount; else b.fees[r.kind] = (b.fees[r.kind] || 0) + r.amount; }
  b.feeTotal = Object.values(b.fees).reduce((s, x) => s + x, 0); b.extra = b.feeTotal + b.tax;
  b.paid = (b.food || 0) + b.extra + b.tip + b.donation - b.discounts + (b.round || 0); b.ok = true;
}

// ---------------------------------------------------------------- the answer
function render() {
  const bills = S.bills.map(x => x.b), s = summary(bills), n = s.n, extra = s.feeTotal + s.tax;
  const tips = bills.reduce((t, b) => t + (b.tip || 0), 0), mixed = bills.some(b => b.taxMixed), taxWord = mixed ? 'taxes and restaurant charges' : 'taxes';
  // headline
  const h = $('head'); h.textContent = '';
  h.append(el('div', 'k', n === 1 ? 'On top of your food, you paid' : `On top of your food, in ${n} orders, you paid`), el('b', '', rs(extra)));
  h.append(el('span', '', `${rs(s.food)} of food → ${rs(s.food + extra)} with fees and taxes (${pct(extra, s.food)}% more): ${rs(s.feeTotal)} in fees, ${rs(s.tax)} in ${taxWord}.`));
  const bar = el('div', 'split'), tot = s.food + extra || 1;
  for (const [cls, v] of [['f', s.food], ['t', s.tax], ['x', s.feeTotal]]) { const i = el('i', cls); i.style.width = (v / tot * 100) + '%'; bar.append(i); }
  const lg = el('div', 'legend'); for (const [c, t] of [['#fff', 'Food'], ['#FFD3B4', 'Taxes'], ['#7A2E00', 'Fees']]) { const sp = el('span'); const i = el('i'); i.style.background = c; sp.append(i, t); lg.append(sp); }
  h.append(bar, lg);
  // the fees worth knowing about
  const T = $('tips'); T.textContent = '';
  const biggest = k => Math.max(0, ...bills.map(b => b.fees[k] || 0));
  const NOTE = {
    cod: v => [`${rs(v)} for paying cash on delivery.`, ' Pay online and this fee is gone.'],
    packaging: v => [`${rs(v)} for packaging.`, ` Each restaurant sets its own${n > 1 && biggest('packaging') > 0 ? `: the biggest was ${rs(biggest('packaging'))} on one order` : ''}.`],
    platform: v => [`${rs(v)} in platform fees.`, n > 1 ? ` Charged on every order, about ${rs(v / n)} each, whatever you order.` : ' Charged on every order, whatever you order.'],
    smallcart: v => [`${rs(v)} in small-cart fees.`, ' A slightly bigger order skips these.'],
    surge: v => [`${rs(v)} in late-night, rain or surge fees.`, ' Ordering a little earlier can skip these.'],
    delivery: v => [`${rs(v)} in delivery fees.`, ''],
    handling: v => [`${rs(v)} in handling fees.`, ''],
    membership: v => [`${rs(v)} in membership fees on the bill.`, ''],
    otherfee: v => [`${rs(v)} in other fees.`, ''],
  };
  const top = Object.entries(s.fees).filter(([, v]) => v > 0).sort((a, b) => (b[0] === 'cod') - (a[0] === 'cod') || b[1] - a[1]).slice(0, 3);
  for (const [k, v] of top) { const [a, b] = NOTE[k](v); const d = el('div', 'tip'); d.append(el('b', '', a), b); T.append(d); }
  if (s.waived > 0) { const d = el('div', 'tip'); d.style.borderLeftColor = 'var(--good)'; d.append(el('b', '', `${rs(s.waived)} of fees were waived`), ' (free delivery or reduced fees on the bill).'); T.append(d); }
  // where the money went (all bills together)
  $('rowsTitle').textContent = n === 1 ? 'Where the money went' : `Where the money went, ${n} orders`;
  const R = $('rows'); R.textContent = '';
  const row = (l, a, cls, sub) => { const r = el('div', 'r ' + (cls || '')); const L = el('div', 'l', l); if (sub) L.append(el('small', '', sub)); r.append(L, el('div', 'a', a)); R.append(r); };
  row('Food / items', rs(s.food, true), '', n > 1 ? `${rs(s.food / n)} an order on average` : null);
  row(mixed ? 'Taxes and restaurant charges' : 'Taxes (GST)', rs(s.tax, true), 'tax', mixed ? 'Some apps put packaging in here too' : null);
  for (const k of FEE_KINDS) if (s.fees[k] > 0) row(NAMES[k], rs(s.fees[k], true), 'fee', n > 1 ? `${bills.filter(b => b.fees[k] > 0).length} of ${n} orders` : null);
  if (tips > 0) row('Tips (your choice)', rs(tips, true));
  if (s.discounts > 0) row('Coupons and discounts', '− ' + rs(s.discounts, true), 'good');
  row('Paid', rs(s.paid, true), 'total');
  // membership
  renderMember();
  // each bill
  $('billsWrap').hidden = n < 2 && !bills.some(b => !b.ok);
  const B = $('bills'); B.textContent = '';
  S.bills.forEach((x, i) => {
    const b = x.b, d = el('details', 'bill' + (b.ok ? '' : ' warn')); if (n === 1) d.open = true;
    const sm = el('summary'); const L = el('div', '', x.name); L.append(el('small', '', `  ${rs(b.food)} food`)); sm.append(L, el('div', 'p', `+${rs(b.extra)} (${pct(b.extra, b.food)}%)`)); d.append(sm);
    const rws = el('div', 'rows');
    const edit = (label, get, set, cls) => {
      const r = el('div', 'r ' + (cls || '')); r.append(el('div', 'l', label));
      const a = el('button', 'a', rs(get(), true)); a.type = 'button'; a.style.cssText = 'border:0;background:none;padding:0;font:inherit;font-weight:800;color:inherit';
      a.onclick = () => { const inp = el('input'); inp.inputMode = 'decimal'; inp.value = get(); a.replaceWith(inp); inp.focus(); inp.select(); const done = () => { const v = parseFloat(inp.value.replace(/[^\d.]/g, '')); if (isFinite(v)) { set(v); recompute(b); } render(); }; inp.onblur = done; inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); }; };
      const box = el('div', 'a'); box.append(a); r.append(box); rws.append(r);
    };
    edit('Food / items', () => b.food || 0, v => { b.food = v; });
    for (const r of b.rows) edit((r.label || NAMES[r.kind]) + (r.free ? ' (free)' : ''), () => r.amount, v => { r.amount = v; }, r.kind === 'tax' || r.kind === 'taxcharges' ? 'tax' : FEE_KINDS.includes(r.kind) ? 'fee' : '');
    if (b.discounts) edit('Coupons and discounts', () => b.discounts, v => { b.discounts = v; }, 'good');
    const tr = el('div', 'r total'); tr.append(el('div', 'l', 'Paid'), el('div', 'a', rs(b.paid, true))); rws.append(tr);
    d.append(rws); B.append(d);
  });
}
function renderMember() {
  const bills = S.bills.map(x => x.b), s = summary(bills), n = s.n, V = $('mVerdict');
  const price = parseFloat($('mPrice').value) || 0, per = +$('mPer').value || 1, months = Math.max(0.25, parseFloat($('mMonths').value) || 1);
  store.set('member', { price, per, months });
  const cost = price / per * months, saved = s.waived, deliv = (s.fees.delivery || 0) + (s.fees.smallcart || 0);
  V.className = 'verdict'; V.textContent = '';
  if (!price) { V.classList.add('na'); V.append('Type what your membership costs.'); return; }
  if (saved <= 0) {
    V.classList.add('na'); V.append(el('b', '', 'Nothing was waived on these bills'));
    V.append(deliv > 0 ? `You paid ${rs(deliv)} in delivery and small-cart fees. A free-delivery membership costing ${rs(cost)} for this time would ${deliv > cost ? `have saved you about ${rs(deliv - cost)}.` : `not have paid for itself.`}` : 'So a membership saved you nothing here.');
    return;
  }
  const net = saved - cost, perOrder = saved / n, need = perOrder > 0 ? Math.ceil(price / per / perOrder) : null;
  V.classList.add(net >= 0 ? 'yes' : 'no');
  V.append(el('b', '', net >= 0 ? `Worth it: you're ${rs(net)} ahead` : `Not worth it: you're ${rs(-net)} behind`));
  V.append(`It saved you ${rs(saved)} on these ${n} order${n > 1 ? 's' : ''} and cost ${rs(cost)} for ${months} month${months === 1 ? '' : 's'}.`);
  if (need) V.append(el('div', '', `It pays for itself if you order about ${need} time${need > 1 ? 's' : ''} a month.`));
}
for (const id of ['mPrice', 'mPer', 'mMonths']) $(id).addEventListener('input', () => S.bills.length && renderMember());
{ const m = store.get('member', null); if (m) { $('mPrice').value = m.price; $('mPer').value = String(m.per); $('mMonths').value = m.months; } }

// ---------------------------------------------------------------- wiring
$('pick').onchange = e => { const f = [...e.target.files]; e.target.value = ''; S.bills = []; addFiles(f); };
$('pickMore').onchange = e => { const f = [...e.target.files]; e.target.value = ''; addFiles(f); };
$('pick').addEventListener('click', () => warmUp('eng')); $('sampleBtn').addEventListener('pointerdown', () => { });
$('againBtn').onclick = () => { S.bills = []; history.state?.v === 'result' ? history.back() : show('start'); window.scrollTo({ top: 0 }); };
$('shareBtn').onclick = async () => {
  const s = summary(S.bills.map(x => x.b)), extra = s.feeTotal + s.tax, link = location.origin + location.pathname.replace(/index\.html$/, '');
  const text = `Fee Check: I paid ${rs(extra)} on top of ${rs(s.food)} of food${s.n > 1 ? ` in ${s.n} orders` : ''} (${rs(s.feeTotal)} in fees, ${rs(s.tax)} in taxes).\n\nCheck your own bills free: ${link}`;
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in your chat.'); return; } catch { }
  const ta = el('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { } ta.remove();
  if (ok) toast('Copied. Paste it in your chat.'); else window.prompt('Copy this and send it:', text);
};
// made-up bills (no real app or restaurant) for "Try a sample"
export const SAMPLES = [
  { name: 'Late-night snack', text: 'Bill details\nItem total ₹189.00\nDelivery fee ₹38.00\nSmall cart fee ₹25.00\nLate night fee ₹20.00\nPlatform fee ₹14.90\nRestaurant packaging charges ₹15.00\nGST and restaurant charges ₹9.45\nTo pay ₹311.35' },
  { name: 'Groceries', text: 'Bill details\nItems total ₹412.00\nDelivery charge ₹30.00\nHandling charge ₹11.00\nRain fee ₹20.00\nGrand total ₹473.00' },
  { name: 'Family dinner', text: 'Bill Summary\nItem total ₹1,240.00\nGST (govt. taxes) ₹62.00\nRestaurant packaging charges ₹60.00\nDelivery partner fee ₹49.00\nPlatform fee ₹14.90\nPay on delivery fee ₹30.00\nGrand total ₹1,455.90\nCoupon applied - ₹100.00\nPaid ₹1,355.90' },
];
$('sampleBtn').onclick = () => { S.bills = SAMPLES.map(x => ({ name: x.name, b: readBill(x.text) })); render(); show('result'); window.scrollTo({ top: 0 }); if (history.state?.v !== 'result') history.pushState({ v: 'result' }, ''); };
addEventListener('popstate', e => { if (e.state?.v === 'result' && S.bills.length) show('result'); else show('start'); });
window.FC = { S, readBill, summary, render, show, addFiles, SAMPLES, $ };
