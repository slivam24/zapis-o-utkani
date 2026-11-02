// Parser stránek chess-results.com. Běží v prohlížeči (DOMParser) i v Node (linkedom),
// proto pracuje jen s obecným DOM. Jeden parser pro aplikaci i pro páteční úlohu.
//
// Podoba stránek:
//   soupisky (art=8)    hlavička družstva: '1. Název (Rtg prům.:1917 / ...) Kapitán: Jméno, mail, telefon'
//                       záhlaví sloupců:   Šach. | | Jméno | Rtg | FED | FideID | Typ | Body | Partie
//   rozlosování (art=2) hlavička kola:     '1. Kolo Datum kola 2026/10/18 Hodina 10:00'
//                       řádek zápasu:      Čís. | Družstvo | Družstvo | Výsl. | : | Výsl.

const TEAM_RE = /^\s*(\d{1,3})\.\s+(.+?)\s*\((?:Rtg|Elo|Ø)[^)]*\)\s*(?:Kapit\S*\s*:\s*(.*))?$/is;
const ROUND_RE = /^\s*(\d{1,2})\s*\.\s*(?:kolo|round|runde|rd)\b/i;
const ROUND_ALT_RE = /^\s*(?:kolo|round|runde)\s+(\d{1,2})\b/i;
const TYPE_RE = /^(?:Z|K|ZK|H|V|C)(?:\s*,\s*(?:Z|K|ZK|H|V|C))*$/i;
const TIME_RE = /\b(\d{1,2}):(\d{2})\b/;
const DATE_ISO_RE = /\b(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/;
const DATE_CS_RE = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(20\d{2})\b/;
const SEASON_RE = /\b(20\d{2}|\d{2})\s*\/\s*(20\d{2}|\d{2})\s*$/;
const NOT_A_TITLE_RE = /^(los|sestava|křížová|startovní|abecední|herní|tabulka|statistika|poznámka|note|hinweis|remark)\b/i;
const TITLE_PREFIX_RE = /^.*?chess-results\.com\s*-\s*/i;

export const MAX_NAME = 120;
const MAX_HEADER = 160; // delší text je vnořená tabulka s obsahem celé stránky, ne hlavička

export const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const normalize = (s) =>
  String(s ?? '')
    .replace(/[\s"'“”„]+/g, '')
    .toLowerCase();

/** Přímé buňky řádku, bez buněk vnořených tabulek. */
function cellsOf(tr) {
  return [...tr.children].filter((el) => el.tagName === 'TD' || el.tagName === 'TH').map((el) => clean(el.textContent));
}

function toInt(s) {
  const t = clean(s);
  return /^\d{1,4}$/.test(t) ? Number(t) : null;
}

/** 'Z,ZK' -> ['ZK']; Z (základní sestava) se nezobrazuje. */
export function parseTypes(raw) {
  return String(raw ?? '')
    .split(/[,\s/]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t && t !== 'Z');
}

export function parseDate(text) {
  const iso = DATE_ISO_RE.exec(text);
  if (iso) return `${iso[1]}-${String(+iso[2]).padStart(2, '0')}-${String(+iso[3]).padStart(2, '0')}`;
  const cs = DATE_CS_RE.exec(text);
  if (cs) return `${cs[3]}-${String(+cs[2]).padStart(2, '0')}-${String(+cs[1]).padStart(2, '0')}`;
  return null;
}

/** Název turnaje a sezóna: 'Krajský přebor KŠSV 25/26' -> ['Krajský přebor KŠSV', '2025/2026']. */
export function splitSeason(title) {
  const t = clean(title);
  const m = SEASON_RE.exec(t);
  if (!m) return [t, null];
  let start = m[1];
  let end = m[2];
  if (start.length === 2) start = `20${start}`;
  if (end.length === 2) end = start.slice(0, 2) + end;
  return [clean(t.slice(0, m.index)).replace(/[,\-–]+$/, ''), `${start}/${end}`];
}

/**
 * Název turnaje. Přednost má <title>, nadpisy jsou záloha: u turnajů starších dvou týdnů
 * je nad názvem upozornění serveru a u seznamů nadpis s názvem seznamu.
 */
export function tournamentTitle(doc) {
  const titleEl = doc.querySelector('title');
  if (titleEl) {
    const text = clean(titleEl.textContent).replace(TITLE_PREFIX_RE, '');
    if (text && !/^chess-results/i.test(text)) return text.slice(0, MAX_NAME);
  }
  for (const h of doc.querySelectorAll('h1, h2, h3')) {
    const text = clean(h.textContent);
    if (text && text.length <= MAX_NAME && !NOT_A_TITLE_RE.test(text)) return text;
  }
  return '';
}

/**
 * Mapa sloupců ze záhlaví soupisky. Vrací null, pokud řádek záhlaví není.
 * Rozlišuje RtgN (národní) a RtgI (FIDE) od neoznačeného Rtg, u kterého se neví,
 * které Elo to je: závisí na nastavení ve Swiss-Manageru.
 */
export function headerMap(cells) {
  const low = cells.map((c) => clean(c).toLowerCase());
  if (!low.some((c) => c === 'jméno' || c === 'name') || !low.some((c) => c.startsWith('rtg') || c === 'elo')) {
    return null;
  }
  const map = {};
  low.forEach((c, i) => {
    const k = c.replace(/\s/g, '');
    if (['šach.', 'šach', 'bd.', 'bd', 'sach.'].includes(k)) map.no = i;
    else if (['jméno', 'name'].includes(k)) map.name = i;
    else if (['rtgn', 'nrtg', 'rtgnat', 'rtglok'].includes(k)) map.nat = i;
    else if (['rtgi', 'irtg', 'fide', 'rtgfide'].includes(k)) map.fide = i;
    else if (['rtg', 'elo'].includes(k)) map.rtg = i;
    else if (k === 'fed') map.fed = i;
    else if (['typ', 'type'].includes(k)) map.type = i;
  });
  return map.name === undefined ? null : map;
}

function playerFrom(cells, linkTexts, hm) {
  const no = toInt(cells[0]);
  if (no === null) return null;

  let name = '';
  if (hm?.name !== undefined && cells[hm.name]?.includes(',')) name = cells[hm.name];
  else name = linkTexts.find((t) => t.includes(',')) ?? cells.find((c) => c.includes(',') && !/^\d+$/.test(c)) ?? '';
  name = clean(name);
  if (!name) return null;

  const col = (key) => (hm?.[key] !== undefined ? cells[hm[key]] : '');
  let rtg = toInt(col('rtg'));
  const nat = toInt(col('nat'));
  const fide = toInt(col('fide'));
  if (!hm) {
    // nouzově: první rozumné číslo za jménem
    const idx = cells.findIndex((c) => clean(c) === name);
    for (const c of cells.slice(idx + 1)) {
      const v = toInt(c);
      if (v !== null && (v === 0 || (v >= 600 && v <= 3000))) {
        rtg = v;
        break;
      }
    }
  }
  const rawType = hm ? col('type') : (cells.find((c) => TYPE_RE.test(clean(c))) ?? '');
  const pos = (v) => (v && v > 0 ? v : null);
  return {
    no,
    name,
    types: parseTypes(rawType),
    // rtg = neoznačené Elo ze sloupce Rtg, neví se, o které jde
    rtg: pos(rtg),
    nat: pos(nat),
    fide: pos(fide),
  };
}

/** Hlavička kola jen v řádku s jedinou krátkou buňkou, jinak se chytí navigace nebo vnořená tabulka. */
function roundHeader(nonEmpty) {
  if (nonEmpty.length !== 1 || nonEmpty[0].length > MAX_HEADER) return null;
  return ROUND_RE.exec(nonEmpty[0]) ?? ROUND_ALT_RE.exec(nonEmpty[0]);
}

/**
 * Soupisky družstev z řádků tabulky. Řádek je { cells, links }.
 * Společné jádro pro stránku i pro export do Excelu, aby rozpoznávání družstev
 * a hráčů existovalo jen jednou.
 */
export function parseRosterRows(rows) {
  const teams = [];
  let cur = null;
  let hm = null;
  for (const { cells, links } of rows) {
    if (!cells.length) continue;
    const nonEmpty = cells.filter(Boolean);
    if (!nonEmpty.length) continue;

    if (nonEmpty.length <= 3 && nonEmpty[0].length <= 300) {
      const m = TEAM_RE.exec(nonEmpty.join(' '));
      if (m) {
        cur = { name: clean(m[2]), captain: clean((m[3] ?? '').split(',')[0]), players: [] };
        teams.push(cur);
        hm = null;
        continue;
      }
    }
    const h = headerMap(cells);
    if (h) {
      hm = h;
      continue;
    }
    if (!cur) continue;
    const p = playerFrom(cells, links ?? [], hm);
    if (p) cur.players.push(p);
  }
  return teams;
}

const rowsFromDocument = (doc) =>
  [...doc.querySelectorAll('tr')].map((tr) => ({
    cells: cellsOf(tr),
    links: [...tr.querySelectorAll('a')].map((a) => clean(a.textContent)),
  }));

/** Soupisky družstev ze stránky art=8 nebo art=1. */
export const parseRosters = (doc) => parseRosterRows(rowsFromDocument(doc));

/** Soupisky družstev z exportu do Excelu (mřížka buněk z js/xlsx.js). */
export const parseRostersFromGrid = (grid) => parseRosterRows(grid.map((cells) => ({ cells, links: [] })));

/** Hlavička exportu: 2. řádek bývá název soutěže se sezónou. */
export function titleFromGrid(grid) {
  for (const cells of grid.slice(0, 6)) {
    const text = clean(cells[0] ?? '');
    if (!text || text.length > MAX_NAME) continue;
    if (/chess-results|poslední aktualizace|last update/i.test(text)) continue;
    if (NOT_A_TITLE_RE.test(text)) continue;
    if (TEAM_RE.test(text)) break;
    return text;
  }
  return '';
}


/** Rozlosování z řádků tabulky. Dvojice se poznají podle názvů družstev ze soupisek. */
export function parseRoundRows(rows, teamNames) {
  const byNorm = new Map(teamNames.map((n) => [normalize(n), n]));
  const rounds = [];
  let cur = null;
  for (const cells of rows) {
    const nonEmpty = cells.filter(Boolean);
    if (!nonEmpty.length) continue;

    const rm = roundHeader(nonEmpty);
    if (rm) {
      const text = nonEmpty[0];
      const tm = TIME_RE.exec(text);
      cur = {
        no: Number(rm[1]),
        date: parseDate(text),
        time: tm ? `${String(+tm[1]).padStart(2, '0')}:${tm[2]}` : null,
        matches: [],
      };
      rounds.push(cur);
      continue;
    }
    if (!cur) continue;
    const found = cells.map((c) => byNorm.get(normalize(c))).filter(Boolean);
    if (found.length >= 2) cur.matches.push({ home: found[0], away: found[1] });
  }
  return rounds.filter((r) => r.matches.length);
}

/** Rozlosování ze stránky art=2. */
export const parseRounds = (doc, teamNames) =>
  parseRoundRows([...doc.querySelectorAll('tr')].map((tr) => cellsOf(tr)), teamNames);

/** Rozlosování z exportu do Excelu. */
export const parseRoundsFromGrid = (grid, teamNames) => parseRoundRows(grid, teamNames);

/**
 * Pozná, co je v exportu do Excelu: soupisky nebo rozlosování.
 * Čtvrtý řádek nese název seznamu ('Sestava družstva bez výsledků', 'Los družstev pro všechna kola'),
 * jistotou je ale obsah, protože názvy se liší podle jazyka.
 */
export function gridKind(grid) {
  const head = grid.slice(0, 6).map((r) => clean(r[0] ?? '')).join(' | ').toLowerCase();
  if (/los dru|pairings|auslosung/.test(head)) return 'rounds';
  if (/sestava|composition|mannschaftsaufstellung/.test(head)) return 'rosters';
  for (const cells of grid) {
    const nonEmpty = cells.filter(Boolean);
    if (!nonEmpty.length) continue;
    if (nonEmpty.length <= 3 && TEAM_RE.test(nonEmpty.join(' '))) return 'rosters';
    if (roundHeader(nonEmpty)) return 'rounds';
  }
  return 'unknown';
}

/** Zkrátí název soutěže na popisek do nabídky. */
export function shorten(name) {
  // \b nefunguje u písmen s diakritikou, proto se hranice slova hlídá mezerou
  const n = clean(name)
    .replace(/(^|\s)(ÚKŠS|UKŠS|ŠSČR|SSCR)(?=\s|$)/gu, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,\-–]+|[\s,\-–]+$/g, '');
  return n.length > 22 ? `${n.slice(0, 21)}…` : n || 'Soutěž';
}

/** Číslo turnaje z odkazu. Přijímá jen chess-results.com. */
export function tournamentNumber(raw) {
  const url = clean(raw).replace(/^[<]|[>]$/g, '').split(/\s/)[0];
  const m = /^https?:\/\/(?:[a-z0-9-]+\.)?chess-results\.com\/tnr(\d{1,9})\.aspx/i.exec(url);
  return m ? Number(m[1]) : null;
}

export const pageUrl = (tnr, art) => `https://chess-results.com/tnr${tnr}.aspx?lan=5&art=${art}&zeilen=0`;

/** Adresa exportu téhož seznamu do Excelu. Je to stabilnější rozhraní než stránka a menší přenos. */
export const exportUrl = (tnr, art) =>
  `https://chess-results.com/tnr${tnr}.aspx?lan=5&zeilen=0&art=${art}&prt=4&excel=2010`;
