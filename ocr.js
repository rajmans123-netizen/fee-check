// Reads a bill screenshot in this page with tesseract.js (WebAssembly). Only the reader's code and its English model are downloaded,
// once; the screenshot itself is never sent anywhere.
const TJS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let workerP = null, workerLang = null, onProg = null;

function loadScript(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load the label reader. Check your internet for the first scan.')); document.head.append(s); });
}
function worker(lang = 'eng') {
  if (workerP && workerLang !== lang) { const old = workerP; workerP = null; old.then(w => w.terminate()).catch(() => { }); }   // one language model in memory at a time
  if (!workerP) workerLang = lang, workerP = (async () => {
    if (!window.Tesseract) await loadScript(TJS);
    const w = await window.Tesseract.createWorker(lang, 1, { logger: m => onProg && onProg(m) });
    await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });   // one block of text lines: label on the left, amount on the right
    return w;
  })().catch(e => { workerP = null; throw e; });
  return workerP;
}
export const warmUp = (lang = 'eng') => worker(lang).catch(() => { });

// a clean grey image about 1600 px wide (2200 for a whole photo, where the list is only part of the picture): big enough for small
// print, small enough to read fast on a phone
async function prep(file, maxW = 1600) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(async () => {
    const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img;
  });
  const w0 = bmp.width, h0 = bmp.height, k = Math.min(2, maxW / w0, maxW * 2 / h0);
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data; let lo = 255, hi = 0; const hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) { const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0; p[i] = y; hist[y]++; }
  let acc = 0, n = p.length / 4; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.01 && lo === 255) lo = v; if (acc > n * 0.995) { hi = v; break; } }
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < p.length; i += 4) { const v = Math.max(0, Math.min(255, (p[i] - lo) * 255 / span)); p[i] = p[i + 1] = p[i + 2] = v; }
  g.putImageData(d, 0, 0); return c;
}

export async function readText(file, progress, lang = 'eng', maxW = 1600) {
  onProg = m => { if (m.status === 'recognizing text') progress?.('Reading the bill', m.progress); else if (/loading|initializ/.test(m.status)) progress?.('Getting the reader ready', m.progress); };
  progress?.('Getting the reader ready', 0);
  const [w, img] = await Promise.all([worker(lang), prep(file, maxW)]);
  const { data } = await w.recognize(img);
  onProg = null; return data.text;
}
