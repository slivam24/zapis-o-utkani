// Načtení soutěže z chess-results přímo v prohlížeči.
//
// chess-results neposílá hlavičku Access-Control-Allow-Origin, takže prohlížeč si jeho stránku
// stáhnout nesmí. Proto se čte přes prostředníka (proxy). Ve výchozím stavu se zkouší veřejné
// služby, v nastavení aplikace jde zadat vlastní adresu (viz worker/README.md).
import {
  parseRosters, parseRounds, parseRostersFromGrid, parseRoundsFromGrid, titleFromGrid, gridKind,
  splitSeason, tournamentTitle, tournamentNumber, shorten, pageUrl, clean,
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

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!/<\s*(table|html)/i.test(text)) throw new Error('odpověď není stránka');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Stáhne stránku turnaje přes první prostředníka, který odpoví. */
export async function fetchPage(tnr, art, proxies) {
  const target = pageUrl(tnr, art);
  const list = (proxies ?? []).filter(Boolean);
  if (!list.length) throw new Error('Není nastavená žádná adresa pro načítání.');
  const problems = [];
  for (const tpl of list) {
    try {
      return await fetchText(proxyUrl(tpl, target));
    } catch (e) {
      problems.push(`${new URL(proxyUrl(tpl, target)).host}: ${e.name === 'AbortError' ? 'vypršel čas' : e.message}`);
    }
  }
  throw new Error(`Načtení se nepovedlo. ${problems.join('; ')}`);
}

const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');

/** Soutěž ze staženého nebo nahraného HTML soupisek, případně i rozlosování. */
export function buildCompetition({ tnr, boards, short, rosterHtml, drawHtml, season }) {
  const doc = toDoc(rosterHtml);
  const teams = parseRosters(doc).filter((t) => t.players.length);
  if (teams.length < 2) {
    throw new Error('Na stránce nejsou soupisky družstev. Vypadá to na turnaj jednotlivců nebo na jinou stránku.');
  }
  const title = tournamentTitle(doc);
  const [name, parsedSeason] = splitSeason(title);
  const rounds = drawHtml ? parseRounds(toDoc(drawHtml), teams.map((t) => t.name)) : [];
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
  const rosterHtml = await fetchPage(tnr, 8, proxies);
  let drawHtml = null;
  try {
    onStep('Stahuju rozlosování…');
    drawHtml = await fetchPage(tnr, 2, proxies);
  } catch {
    onStep('Rozlosování se nepodařilo načíst, družstva půjdou vybrat ručně.');
  }
  return buildCompetition({ tnr, boards, short, rosterHtml, drawHtml, season });
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
 * Soutěž z nahraných souborů: export do Excelu (.xlsx) nebo uložená stránka (.html).
 * Dá se nahrát soupiska i rozlosování najednou, pořadí nerozhoduje.
 */
export async function buildFromFiles(files, { boards, short, url } = {}) {
  let rosterSource = null;
  let roundsGrid = null;
  let roundsDoc = null;
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
      if (kind === 'rounds') roundsGrid = grid;
      else if (kind === 'rosters') rosterSource = { kind: 'grid', grid };
      else throw new Error(`${file.name}: nepoznávám, co v souboru je. Čekám export soupisek nebo rozlosování.`);
    } else {
      const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
      const teams = parseRosters(doc).filter((t) => t.players.length);
      title = title || tournamentTitle(doc);
      if (teams.length >= 2) rosterSource = { kind: 'doc', doc };
      else roundsDoc = doc;
    }
  }

  if (!rosterSource) {
    throw new Error('Mezi soubory chybí soupisky družstev. Nahraj export seznamu „Sestava družstva bez výsledků“.');
  }
  const teams = (rosterSource.kind === 'grid' ? parseRostersFromGrid(rosterSource.grid) : parseRosters(rosterSource.doc))
    .filter((t) => t.players.length);
  if (teams.length < 2) {
    throw new Error('V souboru jsou soupisky jen jednoho družstva. Vypadá to na turnaj jednotlivců.');
  }
  const names = teams.map((t) => t.name);
  const rounds = roundsGrid
    ? parseRoundsFromGrid(roundsGrid, names)
    : roundsDoc
      ? parseRounds(roundsDoc, names)
      : [];

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
