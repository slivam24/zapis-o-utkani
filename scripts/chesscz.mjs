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

/** Chyba stažení; `status` je stavový kód HTTP, když server odpověděl. */
const fetchError = (url, message, status) => Object.assign(new Error(`${url}: ${message}`), status ? { status } : {});

/**
 * Stažení stránky z chess.cz s pár pokusy. Stránka, která neexistuje (404), se znovu nezkouší:
 * chess.cz takhle odpovídá i na rozpis soutěže, která ještě nemá zadaná kola.
 */
export async function fetchHtml(url, { retries = 3, timeoutMs = 30000, pause = 800 } = {}) {
  let last;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'cs' }, signal: ctrl.signal });
      if (res.status === 404) throw fetchError(url, 'HTTP 404', 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(pause); // ohleduplně k serveru svazu
      return html;
    } catch (e) {
      if (e.status === 404) throw e;
      last = e;
      if (attempt < retries) await sleep(2000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw fetchError(url, last?.message);
}

/** Počet šachovnic soutěže z prvních odehraných kol (zkusí nejvýš `tries` kol). */
export async function detectBoards(id, rounds, { tries = 3, get = fetchHtml } = {}) {
  for (const r of rounds.slice(0, tries)) {
    const n = parseBoards(toDoc(await get(boardsUrl(id, r))));
    if (n > 0) return n;
  }
  return 0;
}

// ---------- soupisky a rozpis přímo z chess.cz ----------
// Celá soutěž ze dvou stránek: „Všechny soupisky“ (tabulka na družstvo, název v popisku tabulky)
// a „Rozpis“ (tabulka na kolo: číslo kola a datum v záhlaví, zápasy jako odkazy na družstva).

export const rostersUrl = (id) => `${BASE}/soutez/druzstvo/${id}/`;
export const scheduleUrl = (id) => `${BASE}/soutez/rozpis/${id}/`;

const toInt = (s) => {
  const n = Number.parseInt(String(s ?? '').replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const isoDate = (s) => {
  const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(s ?? '');
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

/**
 * Hráči z tabulky soupisky: { no, id, name, types, rtg: null, nat, fide }. id je číslo z odkazu
 * chess.cz/hrac/<id>/, tedy ID hráče v LOK (podle něj se doplňují aktuální ratingy, scripts/lok.mjs).
 */
function rosterRows(table) {
  const head = [...(table.querySelector('thead tr, tr')?.querySelectorAll('th,td') ?? [])].map(text);
  const col = (label) => head.indexOf(label);
  const pos = (v) => (v && v > 0 ? v : null);
  const players = [];
  for (const tr of table.querySelectorAll('tbody tr')) {
    const cells = [...tr.querySelectorAll('td')].map(text);
    const no = /^(\d+)\.?$/.exec(cells[0] ?? '');
    const link = tr.querySelector('a[href*="/hrac/"]');
    if (!no || !link) continue;
    const id = Number(/\/hrac\/(\d+)/.exec(link.getAttribute('href') ?? '')?.[1]) || null;
    players.push({
      no: Number(no[1]),
      ...(id ? { id } : {}),
      name: cells[col('Jméno hráče')] ?? '',
      // Z je jen registrace, typ hráče jsou K, ZK, H, V, C
      types: (cells[col('Typ')] ?? '').split(/[\s,]+/).map((t) => t.toUpperCase()).filter((t) => t && t !== 'Z'),
      rtg: null,
      nat: pos(toInt(cells[col('N ELO')])),
      fide: pos(toInt(cells[col('F ELO')])),
    });
  }
  return players;
}

/**
 * Stránka „Všechny soupisky“: [{ name, cz, captain, players }]. Kapitán je hráč s typem K.
 * cz je číslo družstva na chess.cz z odkazu v popisku tabulky (stránka družstva, teamUrl).
 */
export function parseAllRosters(doc) {
  const teams = [];
  for (const table of doc.querySelectorAll('table')) {
    const caption = table.querySelector('caption');
    const name = text(caption);
    const head = [...(table.querySelector('thead tr, tr')?.querySelectorAll('th,td') ?? [])].map(text);
    if (!name || !head.includes('Jméno hráče')) continue;
    const players = rosterRows(table);
    const cz = Number(/\/soutez\/druzstvo\/\d+\/(\d+)/.exec(caption.querySelector('a')?.getAttribute('href') ?? '')?.[1]) || null;
    teams.push({ name, ...(cz ? { cz } : {}), captain: players.find((p) => p.types.includes('K'))?.name ?? '', players });
  }
  return teams;
}

// ---------- hrací místnost ze stránky družstva ----------
// Adresu hrací místnosti zadává oddíl jako volný text a chess.cz ji zobrazí jen na stránce družstva,
// zkrácenou na 70 znaků. Do zápisu patří jen místo, ne poznámky o dopravě nebo pravidlech v místnosti.

export const teamUrl = (compId, teamId) => `${BASE}/soutez/druzstvo/${compId}/${teamId}/`;
const VENUE_CUT = 70; // na tolik znaků chess.cz text zkracuje

/** Uklidí text hrací místnosti z chess.cz: bez úvodního popisku, poznámek a useknutého konce. */
export function cleanVenue(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const cut = s.length >= VENUE_CUT;
  s = s
    .replace(/^(adresa\s+)?hrac[íi]\s+m[íi]stnost[i]?\s*:\s*/i, '')
    .replace(/\s+,/g, ',')
    .replace(/,(?:\s*,)+/g, ',');
  // poznámky za adresou: doprava a pravidla v místnosti
  s = s.replace(/[\s,;–-]+(MHD|V hrac[íi] m[íi]stnosti)\b.*$/i, '');
  if (cut && s.length >= VENUE_CUT - 2) {
    // useknutý konec: zpátky k poslední čárce, jinak k poslednímu celému slovu
    const comma = s.lastIndexOf(',');
    s = comma >= 10 ? s.slice(0, comma) : s.slice(0, Math.max(s.lastIndexOf(' '), 0)) || s;
  }
  return s.replace(/[\s,;:–-]+$/, '').trim();
}

// Adresa se mění zřídka: každý týden se ověří čtvrtina družstev, za měsíc všechna.
// Družstvo, které adresu ještě zjištěnou nemá, se stahuje vždy (rozhoduje scripts/fetch_data.mjs).
const VENUE_ROTATION = 4;
const weekNo = (now = Date.now()) => Math.floor(now / (7 * 864e5));
/** Má se hrací místnost družstva ověřit tento týden? */
export const venueDue = (teamId, now = Date.now()) => teamId % VENUE_ROTATION === weekNo(now) % VENUE_ROTATION;

/** Hrací místnost ze stránky družstva ('' když ji oddíl nezadal). */
export function parseVenue(doc) {
  for (const tr of doc.querySelectorAll('tr')) {
    const cells = [...tr.querySelectorAll('td,th')];
    if (cells.length >= 2 && text(cells[0]) === 'Hrací místnost') return cleanVenue(text(cells[1]));
  }
  return '';
}

/** Stránka „Rozpis“ (kompletní): [{ no, date, time, matches: [{ home, away }] }]. */
export function parseSchedule(doc) {
  const rounds = [];
  for (const table of doc.querySelectorAll('table')) {
    const head = text(table.querySelector('thead') ?? table.querySelector('tr'));
    const m = /(\d+)\.\s*kolo\s*[-–]\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i.exec(head);
    if (!m) continue;
    const round = { no: Number(m[1]), date: isoDate(m[2]), matches: [] };
    for (const tr of table.querySelectorAll('tbody tr')) {
      const links = [...tr.querySelectorAll('a[href*="/soutez/druzstvo/"]')].map(text);
      if (links.length >= 2) round.matches.push({ home: links[0], away: links[1] });
      const time = /^(\d{1,2}):(\d{2})$/.exec(text(tr.querySelector('td')));
      if (time && !round.time) round.time = `${time[1].padStart(2, '0')}:${time[2]}`;
    }
    rounds.push(round);
  }
  return rounds.sort((a, b) => a.no - b.no);
}

/** Celá soutěž z chess.cz: { teams, rounds, noSchedule? }. Dva dotazy na soutěž. */
export async function fetchCompetition(id, { get = fetchHtml } = {}) {
  const teams = parseAllRosters(toDoc(await get(rostersUrl(id))));
  // Soutěž bez zadaných kol (třeba finále, které se hraje až na konci sezóny) nemá stránku rozpisu,
  // chess.cz vrací 404. Soupisky se ale uloží, rozpis se doplní při některé z dalších aktualizací.
  let rounds = [];
  let noSchedule = false;
  try {
    rounds = parseSchedule(toDoc(await get(scheduleUrl(id))));
  } catch (e) {
    if (e?.status !== 404) throw e;
    noSchedule = true;
  }
  return { teams, rounds, ...(noSchedule ? { noSchedule } : {}) };
}
