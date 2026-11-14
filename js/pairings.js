// Los aktuálního kola z chess-results.com pro dashboard. Běží v prohlížeči i v Node (linkedom),
// proto pracuje jen s obecným DOM, stejně jako js/parse.js.
//
// Podoba stránek:
//   turnaj jednotlivců, art=2   nadpis <h3>'4. Kolo Datum kola 2026/11/14 Hodina 14:20'</h3>
//                                záhlaví: Šach. | | | White | ELO | Body | Výsledek | Body | | Black | ELO | |
//                                Bez parametru rd ukazuje chess-results samo aktuální kolo.
//   turnaj družstev, art=3&rd=N  řádek kola: '2. Kolo Datum kola 2026/11/08 Hodina 10:00'
//                                řádek zápasu: Šach. | 12 | Družstvo | Rtg | - | 7 | Družstvo | Rtg | 5½:2½
//                                pod ním šachovnice; na dashboardu stačí zápasy.

import { clean, parseDate } from './parse.js';

const ROUND_RE = /(\d{1,2})\s*\.\s*(?:kolo|round|runde|rd|ronda|tour|turno|kolo)\b/i;
const TIME_RE = /\b(\d{1,2}):(\d{2})\b/;
const TITLE_RE = /^(?:GM|IM|FM|CM|WGM|WIM|WFM|WCM|AGM|AIM|AFM|ACM)$/;
const RESULT_RE = /^(?:[½01+\-=]|0K|1K|½K|-K|\+K)\s*[-:]\s*(?:[½01+\-=]|0K|1K|½K|-K|\+K)$/i;
const BYE_RE = /(?:bye|volno|nehraje|spielfrei|soupeře|not paired|ausgelost|allocated)/i;

const isTeamHeader = (t) => /^(?:šach|bo|br|tisch|board|brd|č)\.?$/i.test(t);

function directCells(tr) {
  return [...tr.children].filter((el) => el.tagName === 'TD' || el.tagName === 'TH');
}

const text = (el) => clean(el?.textContent).replace(/½/g, '½');

const num = (s) => (/^\d{3,4}$/.test(clean(s)) ? Number(clean(s)) : null);

/** Body hráče: '2½' -> 2.5. */
function points(s) {
  const t = clean(s).replace(',', '.');
  const m = /^(\d{1,2})?(½|\.5)?$/.exec(t);
  if (!t || !m || (!m[1] && !m[2])) return null;
  return Number(m[1] || 0) + (m[2] ? 0.5 : 0);
}

function normResult(s) {
  const t = clean(s).replace(/½/g, '½').replace(/\s+/g, ' ');
  if (!t || t === '-' || t === ':') return '';
  // kontumace: '+ - -' a '- - +'
  if (/^\+\s*-\s*-$/.test(t)) return '+ – −';
  if (/^-\s*-\s*\+$/.test(t)) return '− – +';
  if (/^-\s*-\s*-$/.test(t)) return '− – −';
  return RESULT_RE.test(t.replace(/\s/g, '')) ? t.replace(/\s*([-:])\s*/, ' – ') : t;
}

/** Kolo, datum a hodina z textu nadpisu kola. */
export function parseRoundHeading(s) {
  const t = clean(s);
  const m = ROUND_RE.exec(t);
  if (!m) return null;
  const tm = TIME_RE.exec(t.slice(m.index + m[0].length));
  return {
    round: Number(m[1]),
    date: parseDate(t),
    time: tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null,
  };
}

/** Čísla kol, na která stránka odkazuje (art=2&rd=N u jednotlivců, art=3&rd=N u družstev). */
export function roundLinks(doc, art) {
  const re = new RegExp(`[?&]art=${art}&(?:amp;)?rd=(\\d{1,2})\\b`, 'i');
  const set = new Set();
  for (const a of doc.querySelectorAll('a[href]')) {
    const m = re.exec(a.getAttribute('href'));
    if (m) set.add(Number(m[1]));
  }
  return [...set].sort((x, y) => x - y);
}

/** Turnaj družstev se pozná podle odkazů na nasazení hráčů po kolech (art=3). */
export const isTeamTournament = (doc) => roundLinks(doc, 3).length > 0;

/** Počet kol z hlavičky turnaje (zobrazí se s turdet=YES). */
export function totalRounds(doc) {
  for (const tr of doc.querySelectorAll('tr')) {
    const c = directCells(tr);
    if (c.length !== 2) continue;
    if (/^(?:number of rounds|počet kol|anzahl der runden|rundenanzahl)$/i.test(text(c[0]))) {
      const n = Number(text(c[1]));
      if (n > 0 && n < 100) return n;
    }
  }
  return null;
}

/** Název turnaje: první <h2> v obsahu, záložně <title>. */
export function pageTitle(doc) {
  for (const h of doc.querySelectorAll('h2')) {
    const t = text(h);
    if (t && !/^(?:nasazení|pairings|paarungen|los|nasazení hráčů)/i.test(t)) return t.slice(0, 160);
  }
  const t = text(doc.querySelector('title')).replace(/^.*?chess-results\.com\s*-\s*/i, '');
  return t.slice(0, 160) || null;
}

function roundInfoFor(table) {
  // u jednotlivců je kolo v <h3> těsně před tabulkou, u družstev v prvním řádku tabulky
  for (const tr of table.querySelectorAll('tr')) {
    const c = directCells(tr);
    if (c.length === 1) {
      const info = parseRoundHeading(text(c[0]));
      if (info) return info;
    }
    break;
  }
  let el = table.previousElementSibling;
  for (let i = 0; el && i < 4; i++, el = el.previousElementSibling) {
    const info = parseRoundHeading(text(el));
    if (info) return info;
  }
  return null;
}

const playerLink = (td) =>
  [...td.querySelectorAll('a[href]')].some((a) => /[?&](?:amp;)?snr=\d+/i.test(a.getAttribute('href')));

function player(cells, nameIdx, ratingIdx, pointsIdx) {
  const name = text(cells[nameIdx]);
  const before = text(cells[nameIdx - 1]);
  return {
    name,
    title: TITLE_RE.test(before) ? before : null,
    rating: ratingIdx != null ? num(text(cells[ratingIdx])) : null,
    points: pointsIdx != null ? points(text(cells[pointsIdx])) : null,
  };
}

/**
 * Los kola turnaje jednotlivců (stránka art=2). Vrací { round, date, time, pairings } nebo null.
 * Sloupce se hledají podle záhlaví, protože se liší podle nastavení turnaje (tituly, kluby, federace).
 */
export function parseIndividualRound(doc) {
  for (const table of doc.querySelectorAll('table.CRs1')) {
    const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
    const headIdx = rows.findIndex((tr) => directCells(tr).some((c) => /^(?:výsledek|výsl\.?|result|erg\.?|ergebnis|wynik|résultat)$/i.test(text(c))));
    if (headIdx < 0) continue;
    const head = directCells(rows[headIdx]).map(text);
    const resIdx = head.findIndex((t) => /^(?:výsledek|výsl\.?|result|erg\.?|ergebnis|wynik|résultat)$/i.test(t));
    const isRating = (t) => /^(?:elo|rtg|rating|fide|rtgi|rtgn|nat|elo int|elo nat)$/i.test(t);
    const isPoints = (t) => /^(?:body|pts\.?|pkt\.?|punkte|points|pont)$/i.test(t);

    const pairings = [];
    for (const tr of rows.slice(headIdx + 1)) {
      const cells = directCells(tr);
      if (cells.length < 3) continue;
      const names = cells.map((c, i) => (playerLink(c) ? i : -1)).filter((i) => i >= 0);
      if (!names.length) continue;
      const board = text(cells[0]);
      const w = names[0];
      const b = names.find((i) => i > resIdx) ?? null;
      const wRating = head.findIndex((t, i) => i > w && i < resIdx && isRating(t));
      const wPoints = head.findIndex((t, i) => i > w && i < resIdx && isPoints(t));
      const bRating = b != null ? head.findIndex((t, i) => i > b && isRating(t)) : -1;
      const bPoints = head.findIndex((t, i) => i > resIdx && (b == null || i < b) && isPoints(t));
      const white = player(cells, w, wRating >= 0 ? wRating : null, wPoints >= 0 ? wPoints : null);
      let black = null;
      let result = normResult(text(cells[resIdx]));
      if (b != null) {
        black = player(cells, b, bRating >= 0 ? bRating : null, bPoints >= 0 ? bPoints : null);
      } else {
        // volno (bye): soupeř není, výsledek bývá '+' nebo body za volno
        black = { name: 'volno', title: null, rating: null, points: null, bye: true };
        if (BYE_RE.test(result)) result = '';
      }
      pairings.push({ board: /^\d{1,4}$/.test(board) ? Number(board) : board, white, black, result });
    }
    if (pairings.length) return { ...(roundInfoFor(table) || {}), pairings };
  }
  return null;
}

/**
 * Zápasy kola turnaje družstev (stránka art=3&rd=N). Vrací { round, date, time, matches } nebo null.
 */
export function parseTeamRound(doc) {
  for (const table of doc.querySelectorAll('table.CRs1')) {
    const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.closest('table') === table);
    const matches = [];
    let info = null;
    for (const tr of rows) {
      const c = directCells(tr);
      if (c.length === 1 && !info) info = parseRoundHeading(text(c[0]));
      const t = c.map(text);
      if (c.length < 7 || !isTeamHeader(t[0])) continue;
      // Šach. | č. | Družstvo | Rtg | - | č. | Družstvo | Rtg | skóre
      const dash = t.findIndex((x, i) => i > 2 && x === '-');
      if (dash < 0) continue;
      const home = t[2];
      const away = t[dash + 2];
      if (!home || !away) continue;
      matches.push({
        board: matches.length + 1,
        home: { name: home, nr: Number(t[1]) || null },
        away: { name: away, nr: Number(t[dash + 1]) || null },
        result: clean(t[dash + 4] ?? '').replace(/^[-:]$/, '').replace(/\s*:\s*/, ' : '),
      });
    }
    if (matches.length) return { ...(info || roundInfoFor(table) || {}), matches };
  }
  return null;
}

/** Adresy stránek. turdet=YES přidá hlavičku turnaje (počet kol). */
export const individualUrl = (tnr) => `https://chess-results.com/tnr${tnr}.aspx?lan=5&art=2&turdet=YES&zeilen=0`;
export const teamRoundUrl = (tnr, rd) => `https://chess-results.com/tnr${tnr}.aspx?lan=5&art=3&rd=${rd}&turdet=NO&zeilen=0`;
export const publicUrl = (tnr) => `https://chess-results.com/tnr${tnr}.aspx?lan=5&art=2`;

/** Číslo turnaje z čísla nebo odkazu na kteroukoli stránku turnaje. */
export function parseTournamentInput(raw) {
  const t = clean(raw);
  if (/^\d{3,9}$/.test(t)) return Number(t);
  const m = /chess-results\.com\/tnr(\d{3,9})\.aspx/i.exec(t);
  return m ? Number(m[1]) : null;
}
