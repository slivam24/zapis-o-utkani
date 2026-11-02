// Načtení soutěže z chess-results přímo v prohlížeči.
//
// chess-results neposílá hlavičku Access-Control-Allow-Origin, takže prohlížeč si jeho stránku
// stáhnout nesmí. Proto se čte přes prostředníka (proxy). Ve výchozím stavu se zkouší veřejné
// služby, v nastavení aplikace jde zadat vlastní adresu (viz worker/README.md).
import {
  parseRosters, parseRounds, parseRostersFromGrid, parseRoundsFromGrid, titleFromGrid, gridKind,
  splitSeason, tournamentTitle, tournamentNumber, shorten, pageUrl, exportUrl, clean,
} from './parse.js';
import { xlsxToGrid } from './xlsx.js';

export const DEFAULT_PROXIES = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
];

const TIMEOUT_MS = 45000; // stránky chess-results bývají pomalé, přes prostředníka tím spíš

export function proxyUrl(template, target) {
  return template.includes('{url}')
    ? template.replace('{url}', encodeURIComponent(target))
    : template.replace(/\/?$/, '/') + target;
}

async function fetchVia(url, binary) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (binary) {
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 2));
      // prostředník, který by soubor překódoval na text, by ZIP rozbil, proto kontrola hlavičky
      if (head[0] !== 0x50 || head[1] !== 0x4b) throw new Error('odpověď není soubor .xlsx');
      return buf;
    }
    const text = await res.text();
    if (!/<\s*(table|html)/i.test(text)) throw new Error('odpověď není stránka');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Stáhne seznam z turnaje přes prvního prostředníka, který odpoví. */
async function fetchThrough(target, proxies, binary) {
  const list = (proxies ?? []).filter(Boolean);
  if (!list.length) throw new Error('Není nastavená žádná adresa pro načítání.');
  const problems = [];
  for (const tpl of list) {
    try {
      return await fetchVia(proxyUrl(tpl, target), binary);
    } catch (e) {
      problems.push(`${new URL(proxyUrl(tpl, target)).host}: ${e.name === 'AbortError' ? 'vypršel čas' : e.message}`);
    }
  }
  throw new Error(`Načtení se nepovedlo. ${problems.join('; ')}`);
}

export const fetchPage = (tnr, art, proxies) => fetchThrough(pageUrl(tnr, art), proxies, false);

/**
 * Stáhne seznam turnaje, přednostně jako export do Excelu.
 * Export je zhruba desetkrát menší než stránka, takže projde i tam, kde velká stránka vyprší.
 * Vrací { grid } u exportu nebo { html } u stránky.
 */
export async function fetchList(tnr, art, proxies) {
  try {
    const buf = await fetchThrough(exportUrl(tnr, art), proxies, true);
    return { grid: await xlsxToGrid(buf) };
  } catch {
    return { html: await fetchPage(tnr, art, proxies) };
  }
}

const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');

/** Soutěž ze staženého seznamu, ať už přišel jako export do Excelu, nebo jako stránka. */
export function buildCompetition({ tnr, boards, short, roster, draw, season }) {
  const teams = (roster.grid ? parseRostersFromGrid(roster.grid) : parseRosters(toDoc(roster.html)))
    .filter((t) => t.players.length);
  if (teams.length < 2) {
    throw new Error('Nenašel jsem soupisky družstev. Vypadá to na turnaj jednotlivců nebo na jinou stránku.');
  }
  const title = roster.grid ? titleFromGrid(roster.grid) : tournamentTitle(toDoc(roster.html));
  const [name, parsedSeason] = splitSeason(title);
  const names = teams.map((t) => t.name);
  const rounds = !draw ? [] : draw.grid ? parseRoundsFromGrid(draw.grid, names) : parseRounds(toDoc(draw.html), names);
  return {
    id: `t${tnr}`,
    short: short || shorten(name),
    name: name || `Turnaj ${tnr}`,
    group: '',
    tnr,
    boards,
    season: parsedSeason || season || '',
    url: `https://chess-results.com/tnr${tnr}.aspx?lan=5`,
    teams,
    rounds,
    added: new Date().toISOString(),
    local: true,
  };
}

/**
 * Načte soutěž podle odkazu. Rozlosování je nepovinné, bez něj se vybírají družstva ručně.
 * onStep hlásí průběh, ať uživatel ví, co se děje.
 */
export async function loadCompetition({ url, boards, short, proxies, season }, onStep = () => {}) {
  const tnr = tournamentNumber(url);
  if (tnr === null) {
    throw new Error('Odkaz nevede na turnaj na chess-results.com. Čekám adresu ve tvaru https://chess-results.com/tnr1507857.aspx');
  }
  onStep('Stahuju soupisky…');
  const roster = await fetchList(tnr, 8, proxies);
  let draw = null;
  try {
    onStep('Stahuju rozlosování…');
    draw = await fetchList(tnr, 2, proxies);
  } catch {
    onStep('Rozlosování se nepodařilo načíst, družstva půjdou vybrat ručně.');
  }
  return buildCompetition({ tnr, boards, short, roster, draw, season });
}

/** Krátké stabilní id pro soutěž nahranou ze souboru, u které není známé číslo turnaje. */
function idFromName(name) {
  let h = 2166136261;
  for (const ch of String(name)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return `x${(h >>> 0).toString(36)}`;
}

/**
 * Roztřídí nahrané soubory na soupisky a rozlosování. Přijímá export do Excelu (.xlsx)
 * i uloženou stránku (.html), na pořadí souborů nezáleží.
 */
export async function readFiles(files) {
  let roster = null;
  let draw = null;
  let title = '';

  for (const file of files) {
    const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheet');
    if (isXlsx) {
      let grid;
      try {
        grid = await xlsxToGrid(await file.arrayBuffer());
      } catch (e) {
        throw new Error(`${file.name}: ${e.message}`);
      }
      const kind = gridKind(grid);
      title = title || titleFromGrid(grid);
      if (kind === 'rounds') draw = { grid };
      else if (kind === 'rosters') roster = { grid };
      else throw new Error(`${file.name}: nepoznávám, co v souboru je. Čekám export soupisek nebo rozlosování.`);
    } else {
      const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
      title = title || tournamentTitle(doc);
      if (parseRosters(doc).filter((t) => t.players.length).length >= 2) roster = { doc };
      else draw = { doc };
    }
  }
  if (!roster && !draw) throw new Error('V souborech jsem nenašel soupisky ani rozlosování.');
  return { roster, draw, title };
}

/** Rozlosování z nahraného souboru, přiřazené k družstvům už načtené soutěže. */
export function roundsFor(draw, teamNames) {
  if (!draw) return [];
  return draw.grid ? parseRoundsFromGrid(draw.grid, teamNames) : parseRounds(toDoc(draw.html ?? ''), teamNames);
}

/** Soutěž z nahraných souborů. Soupisky jsou povinné, rozlosování nepovinné. */
export async function buildFromFiles(files, { boards, short, url } = {}) {
  const { roster, draw, title } = await readFiles(files);
  if (!roster) {
    throw new Error(
      'V souborech jsou jen kola, chybí soupisky družstev. Nahraj k tomu i export seznamu „Sestava družstva bez výsledků“.',
    );
  }
  const teams = (roster.grid ? parseRostersFromGrid(roster.grid) : parseRosters(roster.doc)).filter(
    (t) => t.players.length,
  );
  if (teams.length < 2) {
    throw new Error('V souboru jsou soupisky jen jednoho družstva. Vypadá to na turnaj jednotlivců.');
  }
  const names = teams.map((t) => t.name);
  const rounds = draw ? (draw.grid ? parseRoundsFromGrid(draw.grid, names) : parseRounds(draw.doc, names)) : [];

  const [name, season] = splitSeason(clean(title));
  const tnr = tournamentNumber(url ?? '');
  const finalName = name || `Soutěž ${new Date().toLocaleDateString('cs-CZ')}`;
  return {
    id: tnr === null ? idFromName(`${finalName}|${season ?? ''}`) : `t${tnr}`,
    short: short || shorten(finalName),
    name: finalName,
    group: '',
    tnr: tnr ?? null,
    boards,
    season: season ?? '',
    url: tnr === null ? '' : `https://chess-results.com/tnr${tnr}.aspx?lan=5`,
    teams,
    rounds,
    added: new Date().toISOString(),
    local: true,
  };
}

/** Odkaz na předvyplněné hlášení na GitHubu, když načtení v prohlížeči selže. */
export function issueUrl(repo, { url, boards, short }) {
  const p = new URLSearchParams({
    template: 'nova-soutez.yml',
    title: 'Nová soutěž',
    url: url ?? '',
    boards: String(boards ?? ''),
    short: short ?? '',
  });
  return `https://github.com/${repo}/issues/new?${p}`;
}
