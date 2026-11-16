// Čtení stránek soutěží družstev na chess.cz: seznam soutěží kraje, celostátní soutěže,
// detail soutěže (odkaz na chess-results, kola) a výsledky po šachovnicích (počet šachovnic).
import { parseHTML } from 'linkedom';
import { tournamentNumber } from '../js/parse.js';
import { UA, sleep } from './chess_results.mjs';

export const BASE = 'https://www.chess.cz';
export const regionUrl = (krajNo, year) => `${BASE}/souteze/kraj-${krajNo}/rocnik-${year}/`;
export const leaguesUrl = () => `${BASE}/souteze/vyber-kraje/`;
export const detailUrl = (id) => `${BASE}/soutez/${id}/`;
export const boardsUrl = (id, round) => `${BASE}/soutez/sachovnice/${id}/kolo-${round}/`;

const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const idFromHref = (href) => {
  const m = /\/soutez\/(\d+)\/?$/.exec(href ?? '');
  return m ? Number(m[1]) : null;
};

export const toDoc = (html) => parseHTML(html).document;

/** Soutěže na stránce kraje: nadpis tabulky a odkaz „Detail soutěže“. */
export function parseRegionPage(doc) {
  const out = [];
  for (const head of doc.querySelectorAll('.region-table-title')) {
    const name = text(head.querySelector('h2'));
    const id = idFromHref(head.querySelector('a[href*="/soutez/"]')?.getAttribute('href'));
    if (name && id) out.push({ chesscz: id, name });
  }
  return out;
}

/** Celostátní soutěže (dospělí i mládež) ze stránky Výběr kraje, část Výběr lig. */
export function parseLeagues(doc) {
  const out = [];
  const seen = new Set();
  for (const a of doc.querySelectorAll('.leagues a[href*="/soutez/"]')) {
    const id = idFromHref(a.getAttribute('href'));
    const name = text(a);
    if (id && name && !seen.has(id)) {
      seen.add(id);
      out.push({ chesscz: id, name });
    }
  }
  return out;
}

/** Detail soutěže: číslo turnaje na chess-results a počet kol s výsledky po šachovnicích. */
export function parseDetail(doc) {
  let tnr = null;
  for (const a of doc.querySelectorAll('a[href*="chess-results.com"]')) {
    tnr = tournamentNumber(a.getAttribute('href'));
    if (tnr !== null) break;
  }
  const rounds = [...doc.querySelectorAll('a[href*="/soutez/sachovnice/"]')]
    .map((a) => Number(/kolo-(\d+)/.exec(a.getAttribute('href') ?? '')?.[1]))
    .filter(Number.isFinite);
  return { tnr, rounds: [...new Set(rounds)].sort((a, b) => a - b) };
}

/**
 * Počet šachovnic z výsledků kola: každý zápas je tabulka s řádkem na šachovnici v těle tabulky
 * (celkové skóre je v patičce). Vrací 0, když se kolo ještě nehrálo.
 */
export function parseBoards(doc) {
  let max = 0;
  for (const table of doc.querySelectorAll('table')) max = Math.max(max, table.querySelectorAll('tbody tr').length);
  return max;
}

/** Stažení stránky z chess.cz s pár pokusy. */
export async function fetchHtml(url, { retries = 3, timeoutMs = 30000, pause = 800 } = {}) {
  let last;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'cs' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(pause); // ohleduplně k serveru svazu
      return html;
    } catch (e) {
      last = e;
      if (attempt < retries) await sleep(2000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${url}: ${last?.message}`);
}

/** Počet šachovnic soutěže z prvních odehraných kol (zkusí nejvýš `tries` kol). */
export async function detectBoards(id, rounds, { tries = 3, get = fetchHtml } = {}) {
  for (const r of rounds.slice(0, tries)) {
    const n = parseBoards(toDoc(await get(boardsUrl(id, r))));
    if (n > 0) return n;
  }
  return 0;
}
