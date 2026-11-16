// Jednotné řazení a pojmenování soutěží: celostátní soutěže, soutěže mládeže a 14 krajských svazů.
// Úroveň a zkratka se odvozují z názvu soutěže, kraj je uložený u soutěže (pole region).

/**
 * Kraje podle chess.cz (Soutěže družstev → Výběr kraje). Kód je bez diakritiky, aby se dobře psal do dat,
 * chesscz je číslo kraje v adrese https://www.chess.cz/souteze/kraj-<číslo>/rocnik-<rok>/.
 */
export const REGIONS = [
  { code: 'CR', abbr: 'ŠSČR', name: 'Celostátní soutěže' },
  { code: 'JmSS', abbr: 'JmŠS', name: 'Jihomoravský kraj', chesscz: 22 },
  { code: 'JSS', abbr: 'JŠS', name: 'Jihočeský kraj', chesscz: 13 },
  { code: 'KHSS', abbr: 'KHŠS', name: 'Královéhradecký kraj', chesscz: 18 },
  { code: 'KSSKV', abbr: 'KŠSKV', name: 'Karlovarský kraj', chesscz: 15 },
  { code: 'KSSV', abbr: 'KŠSV', name: 'Kraj Vysočina', chesscz: 21 },
  { code: 'MKSS', abbr: 'MKŠS', name: 'Moravskoslezský kraj', chesscz: 25 },
  { code: 'PDSS', abbr: 'PDŠS', name: 'Pardubický kraj', chesscz: 19 },
  { code: 'PSS', abbr: 'PŠS', name: 'Praha', chesscz: 11 },
  { code: 'SSS', abbr: 'SŠS', name: 'Středočeský kraj', chesscz: 12 },
  { code: 'SSLK', abbr: 'ŠSLK', name: 'Liberecký kraj', chesscz: 17 },
  { code: 'SSOK', abbr: 'ŠSOK', name: 'Olomoucký kraj', chesscz: 24 },
  { code: 'SSPK', abbr: 'ŠSPK', name: 'Plzeňský kraj', chesscz: 14 },
  { code: 'SSZK', abbr: 'ŠSZK', name: 'Zlínský kraj', chesscz: 23 },
  { code: 'UKSS', abbr: 'ÚKŠS', name: 'Ústecký kraj', chesscz: 16 },
];
export const regionByCode = (code) => REGIONS.find((r) => r.code === code) ?? null;

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Kraj z textu (název soutěže, nadpis stránky): podle zkratky svazu nebo názvu kraje. */
export function regionFromText(text) {
  const t = fold(text);
  for (const r of REGIONS) {
    if (r.code === 'CR') continue;
    const abbr = fold(r.abbr);
    if (new RegExp(`(^|[^a-z])${abbr}([^a-z]|$)`).test(t)) return r.code;
  }
  for (const r of REGIONS) {
    if (r.code === 'CR') continue;
    const stem = fold(r.name.replace(/ kraj$/, '').replace(/^Kraj /, '')).slice(0, 7);
    if (stem.length >= 5 && t.includes(stem)) return r.code;
  }
  return null;
}

const YOUTH = /mladez|dorost|zac|junior|\bu ?1\d\b|\bu ?2\d\b/;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

/** Skupina soutěže: písmeno ('A'), nebo východ/západ. */
function groupOf(name, group) {
  if (group && String(group).trim()) return String(group).trim();
  const t = fold(name);
  if (/vychod/.test(t)) return 'východ';
  if (/zapad/.test(t)) return 'západ';
  const m = /['"„“‚‘’]\s*([a-z])\s*['"„“‚‘’]|skupina\s+([a-z])\b|\s([a-z])$/i.exec(String(name).trim());
  return m ? (m[1] ?? m[2] ?? m[3]).toUpperCase() : '';
}

/**
 * Úroveň soutěže: { youth, rank, cls, group }. Menší rank = vyšší soutěž.
 * Extraliga 0, 1. liga 1, 2. liga 2, 3. liga 3, krajský přebor 10 (+ třída), krajská soutěž 15,
 * okresní a regionální 20, ostatní 30.
 */
export function tierOf(comp) {
  const name = comp?.name ?? '';
  const t = fold(name);
  const youth = YOUTH.test(t);
  const group = groupOf(name, comp?.group);
  let rank = 30;
  let cls = 1;
  if (/extraliga/.test(t)) rank = 0;
  else if (/finale/.test(t)) rank = 0.5;
  else if (/(\d)\.\s*liga/.test(t)) rank = Number(/(\d)\.\s*liga/.exec(t)[1]);
  else if (/krajsk\w* prebor|\bkp\b/.test(t)) {
    const m = /\b(i{1,3}|iv|v)\.?\s*tr/.exec(t) ?? /\bkp\s*(i{1,3}|iv|v)\b/.exec(t) ?? /\b(\d)\.\s*tr/.exec(t);
    cls = m ? ROMAN[m[1]] ?? Number(m[1]) : 1;
    rank = 10 + cls - 1;
  } else if (/krajsk\w* soutez/.test(t)) rank = 15;
  else if (/okresn|regionaln|oblastn|mestsk/.test(t)) rank = 20;
  return { youth, rank, cls, group };
}

/** Jednotná zkratka: Extraliga, 1. liga východ, 2. liga A, KP, KP II A, KP III B, … (+ „ml.“ u mládeže). */
export function standardShort(comp) {
  const { youth, rank, cls, group } = tierOf(comp);
  const g = group ? ` ${group}` : '';
  const y = youth ? ' ml.' : '';
  if (rank === 0) return `Extraliga${y}${g}`;
  if (rank === 0.5) return `Finále${y}${g}`;
  if (rank >= 1 && rank <= 9) return `${rank}. liga${y}${g}`;
  if (rank >= 10 && rank < 15) return `KP${cls > 1 ? ` ${['', 'I', 'II', 'III', 'IV', 'V'][cls]}` : ''}${y}${g}`;
  return comp?.short || comp?.name || '';
}

/** Je soutěž ukončená? Poslední kolo před víc než `days` dny. Soutěž bez rozlosování se za ukončenou nepovažuje. */
export function isFinished(comp, { now = new Date(), days = 30 } = {}) {
  // seznam soutěží nese datum posledního kola, celá soutěž rozlosování
  const rounds = Array.isArray(comp?.rounds) ? comp.rounds : [];
  const dates = rounds.map((r) => r.date).filter(Boolean).sort();
  const lastDate = comp?.lastRound ?? dates.at(-1);
  if (!lastDate) return false;
  const last = new Date(`${lastDate}T12:00:00`);
  return now - last > days * 86400000;
}

const groupOrder = (g) => (g === 'východ' ? 'A0' : g === 'západ' ? 'A1' : `B${g}`);

/** Řazení uvnitř skupiny: dospělí před mládeží, vyšší soutěž dřív, pak skupina A, B, C. */
export function compareComps(a, b) {
  const ta = tierOf(a);
  const tb = tierOf(b);
  return (
    Number(ta.youth) - Number(tb.youth) ||
    ta.rank - tb.rank ||
    groupOrder(ta.group).localeCompare(groupOrder(tb.group)) ||
    String(a.name).localeCompare(String(b.name), 'cs')
  );
}

/**
 * Soutěže rozdělené do skupin pro nabídku: celostátní, celostátní mládeže, kraje (můj kraj první),
 * vlastní (přidané v zařízení), ukončené. Kraj `region` (kód) omezí kraje jen na ten jeden.
 * `keep` je id soutěže, která se ukáže vždy (právě vybraná).
 */
export function groupCompetitions(comps, { region = '', now = new Date(), keep = '' } = {}) {
  const groups = new Map();
  const add = (key, label, c) => {
    if (!groups.has(key)) groups.set(key, { key, label, comps: [] });
    groups.get(key).comps.push(c);
  };
  for (const c of comps) {
    if (c.local) {
      add('9local', 'Vlastní soutěže (jen v tomto zařízení)', c);
      continue;
    }
    if (isFinished(c, { now })) {
      if (!region || c.region === region || c.region === 'CR' || c.id === keep) add('9zend', 'Ukončené soutěže', c);
      continue;
    }
    const r = regionByCode(c.region);
    if (!r) {
      add('8other', 'Ostatní soutěže', c);
      continue;
    }
    if (r.code === 'CR') {
      const youth = tierOf(c).youth;
      add(youth ? '1cr-y' : '0cr', youth ? 'Celostátní soutěže mládeže' : 'Celostátní soutěže', c);
      continue;
    }
    if (region && r.code !== region && c.id !== keep) continue;
    add(r.code === region ? '2mine' : `3${r.name}`, `${r.name} (${r.abbr})`, c);
  }
  return [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key, 'cs'))
    .map((g) => ({ ...g, comps: g.comps.sort(compareComps) }));
}
