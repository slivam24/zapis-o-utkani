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

const YOUTH = /mladez|dorost|zaci|zaku|zakyn|zakovsk|junior|\bu ?1\d\b|\bu ?2\d\b/;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
const ROMAN_OUT = ['', 'I', 'II', 'III', 'IV', 'V'];
const SIDES = [
  [/vychod/, 'východ'],
  [/zapad/, 'západ'],
  [/(^|[^a-z])sever([^a-z]|$)/, 'sever'],
  [/(^|[^a-z])jih([^a-z]|$)/, 'jih'],
];

/** Skupina soutěže: písmeno ('A'), nebo světová strana (východ, západ, sever, jih). */
function groupOf(name, group) {
  if (group && String(group).trim()) return String(group).trim();
  const t = fold(name);
  for (const [re, label] of SIDES) if (re.test(t)) return label;
  const m = /['"„“‚‘’]\s*([a-z])\s*['"„“‚‘’]|skupin\w*\s+([a-z])\b|\s([a-z])$/i.exec(String(name).trim());
  return m ? (m[1] ?? m[2] ?? m[3]).toUpperCase() : '';
}

/** Nižší soutěže: [vzor v názvu, zkratka, úroveň]. Místo (Opava, Kroměříž) se bere z textu za názvem. */
const LOWER = [
  [/krajsk\w* soutez/, 'KS', 15],
  [/oblastn\w* prebor/, 'OblP', 17],
  [/regionaln\w* prebor/, 'RP', 18],
  [/regionaln\w* soutez/, 'RS', 19],
  [/okresn\w* prebor|prebor okresu/, 'OP', 20],
  [/mestsk\w* prebor/, 'MP', 20],
  [/okresn\w* soutez/, 'OS', 21],
  [/mestsk\w* soutez/, 'MS', 21],
];

/** Třída soutěže z názvu: „II. třídy“, „KP II“, „Krajská soutěž I.“, „2. třídy“. */
function classOf(t, after = '') {
  const m =
    /\b(i{1,3}|iv|v)\.?\s*tr/.exec(t) ??
    /\b(\d)\.\s*tr/.exec(t) ??
    (after ? new RegExp(`(?:${after})\\s*(i{1,3}|iv|v)\\b\\.?`).exec(t) : null);
  return m ? { cls: ROMAN[m[1]] ?? Number(m[1]), explicit: true } : { cls: 1, explicit: false };
}

/** Místo za názvem soutěže: „Okresní přebor Frýdek-Místek“ → Frýdek-Místek, „- Kroměříž“ → Kroměříž. */
function placeOf(name, re) {
  const t = fold(name);
  const m = re.exec(t);
  if (!m) return '';
  let rest = String(name).slice(m.index + m[0].length);
  rest = rest.replace(/[-–]\s*z[aá]kl\S*(\s+\S+)?\s*$/i, ''); // „- základní část“, „- zákl. skupina A“
  rest = rest.replace(/^[\s.\-–:]+/, '').replace(/['"„“‚‘’]\s*\w\s*['"„“‚‘’]/g, '').trim();
  if (!rest || /^(i{1,3}|iv|v)\.?$/i.test(rest) || /^\w$/.test(rest)) return '';
  if (SIDES.some(([r]) => r.test(fold(rest)))) return '';
  return rest.replace(/\s*[-–]\s*$/, '').trim();
}

/**
 * Úroveň soutěže: { youth, rank, cls, group, kind, place }. Menší rank = vyšší soutěž.
 * Extraliga 0, 1. liga 1, 2. liga 2, 3. liga 3, krajský přebor nebo divize 10 (+ třída),
 * krajská soutěž 15, oblastní, regionální, okresní a městské 17–21, ostatní 30.
 */
export function tierOf(comp) {
  const name = comp?.name ?? '';
  const t = fold(name);
  const youth = YOUTH.test(t);
  const group = groupOf(name, comp?.group);
  let rank = 30;
  let cls = 1;
  let kind = '';
  let place = '';
  let explicit = false;
  if (/extraliga/.test(t)) rank = 0;
  else if (/finale/.test(t)) rank = 0.5;
  else if (/(\d)\.\s*liga/.test(t)) rank = Number(/(\d)\.\s*liga/.exec(t)[1]);
  else if (/krajsk\w* prebor|\bkp\b/.test(t)) {
    ({ cls, explicit } = classOf(t, 'kp|prebor'));
    rank = 10 + cls - 1;
    kind = 'KP';
  } else if (/(\d)\.\s*(\w+\s+)?divize/.test(t)) {
    cls = Number(/(\d)\.\s*(\w+\s+)?divize/.exec(t)[1]);
    rank = 10 + cls - 1;
    kind = 'divize';
  } else {
    for (const [re, abbr, r] of LOWER) {
      if (re.test(t)) {
        rank = r;
        kind = abbr;
        ({ cls, explicit } = classOf(t, 'soutez|prebor'));
        rank += (cls - 1) * 0.1;
        place = placeOf(name, re);
        break;
      }
    }
  }
  // „Krajský přebor I“: koncové I je třída, ne skupina
  const grp = explicit && group === ROMAN_OUT[cls] ? '' : group;
  return { youth, rank, cls, group: grp, kind, place, explicit };
}

/**
 * Jednotná zkratka: Extraliga, 1. liga východ, 2. liga A, KP, KP II A, KP III B, 1. divize, KS I východ,
 * RP B, OP Opava, MP Ostrava (+ „ml.“ u mládeže).
 */
export function standardShort(comp) {
  const { youth, rank, cls, group, kind, place, explicit } = tierOf(comp);
  const g = group ? ` ${group}` : '';
  const y = youth ? ' ml.' : '';
  if (rank === 0) return `Extraliga${y}${g}`;
  if (rank === 0.5) return `Finále${y}${g}`;
  if (rank >= 1 && rank <= 9) return `${rank}. liga${y}${g}`;
  if (kind === 'KP') return `KP${cls > 1 ? ` ${ROMAN_OUT[cls]}` : ''}${y}${g}`;
  if (kind === 'divize') return `${cls}. divize${y}${g}`;
  if (kind) return `${kind}${explicit ? ` ${ROMAN_OUT[cls]}` : ''}${place ? ` ${place}` : ''}${y}${g}`;
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

/** Má soutěž ve sdílených datech soupisky? Seznam nese počet družstev, stažená soutěž přímo družstva. */
export const hasRosters = (comp) => (Array.isArray(comp?.teams) ? comp.teams.length : comp?.teamCount ?? 1) > 0;

/** Kolik soutěží (neukončených i ukončených) má kraj ve sdílených datech. */
export const regionCompCount = (comps, region) => comps.filter((c) => !c.local && c.region === region).length;

/**
 * Soutěže rozdělené do skupin pro nabídku: oblíbené, celostátní, celostátní mládeže, kraje (moje kraje
 * první), vlastní (přidané v zařízení), zatím bez soupisek, ukončené.
 * - `regions` (kódy krajů, dřív jediný `region`) omezí kraje jen na vybrané,
 * - `favs` (id soutěží) jsou úplně nahoře ve skupině Oblíbené soutěže (dokud neskončí),
 * - `keep` je id soutěže, která se ukáže vždy (právě vybraná).
 */
export function groupCompetitions(comps, { region = '', regions = [], favs = [], now = new Date(), keep = '' } = {}) {
  const mine = new Set([...(regions ?? []), ...(region ? [region] : [])].filter(Boolean));
  const fav = new Set(favs ?? []);
  const groups = new Map();
  const add = (key, label, c) => {
    if (!groups.has(key)) groups.set(key, { key, label, comps: [] });
    groups.get(key).comps.push(c);
  };
  for (const c of comps) {
    const finished = !c.local && isFinished(c, { now });
    if (fav.has(c.id) && !finished) {
      add('00fav', 'Oblíbené soutěže', c);
      continue;
    }
    if (c.local) {
      add('9local', 'Vlastní soutěže (jen v tomto zařízení)', c);
      continue;
    }
    const inMyRegion = !mine.size || mine.has(c.region) || c.region === 'CR' || c.id === keep || fav.has(c.id);
    if (finished) {
      if (inMyRegion) add('9zend', 'Ukončené soutěže', c);
      continue;
    }
    // soutěž je v seznamu svazu, ale soupisky ještě nezveřejnil (finále hrané na jaře): dolů, ať nepřekáží
    if (!hasRosters(c)) {
      if (inMyRegion) add('9wait', 'Zatím bez soupisek', c);
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
    if (mine.size && !mine.has(r.code) && c.id !== keep) continue;
    // moje kraje hned za celostátními, ostatní (bez výběru krajů nebo právě vybraná soutěž) za nimi
    add(`${mine.has(r.code) ? '2' : '3'}${r.name}`, `${r.name} (${r.abbr})`, c);
  }
  return [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key, 'cs'))
    .map((g) => ({ ...g, comps: g.comps.sort(compareComps) }));
}
