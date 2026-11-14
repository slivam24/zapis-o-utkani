// Stahování stránek chess-results.com v Node. Parser je společný s aplikací (js/parse.js).
import { parseHTML } from 'linkedom';
import { pageUrl, exportUrl } from '../js/parse.js';

export const UA = 'zapis-o-utkani/1.0 (+https://github.com/slivam24/zapis-o-utkani; tydenni stahovani soupisek)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Stáhne stránku turnaje. Při selhání to zkusí několikrát s prodlevou. */
export async function fetchPage(tnr, art, { retries = 3, timeoutMs = 45000 } = {}) {
  let last;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(pageUrl(tnr, art), {
        headers: { 'User-Agent': UA, 'Accept-Language': 'cs,en;q=0.7' },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      last = e;
      console.error(`  ! pokus ${attempt}/${retries} selhal: ${e.message}`);
      if (attempt < retries) await sleep(3000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Nepodařilo se stáhnout tnr${tnr} art=${art}: ${last?.message}`);
}

export const toDocument = (html) => parseHTML(html).document;

/** Stáhne export seznamu do Excelu. Vrací ArrayBuffer, nebo null, když to nevyjde. */
export async function fetchExport(tnr, art, { retries = 2, timeoutMs = 45000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(exportUrl(tnr, art), {
        headers: { 'User-Agent': UA, 'Accept-Language': 'cs,en;q=0.7' },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 2));
      if (head[0] !== 0x50 || head[1] !== 0x4b) throw new Error('odpověď není soubor .xlsx');
      return buf;
    } catch (e) {
      console.error(`  ! export (pokus ${attempt}/${retries}): ${e.message}`);
      if (attempt < retries) await sleep(2000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
