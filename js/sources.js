// Načtení soutěže ze souborů stažených z chess-results.
//
// Aplikace si stránku z chess-results přečíst nemůže: server neposílá hlavičku
// Access-Control-Allow-Origin a prohlížeč čtení zakáže. Stahování souboru ale prohlížeč nebrání,
// proto se soutěž přidává ze dvou exportů, které aplikace nabídne ke stažení a uživatel nahraje zpět.
import {
  parseRosters, parseRounds, parseRostersFromGrid, parseRoundsFromGrid, titleFromGrid, gridKind,
  splitSeason, tournamentTitle, tournamentNumber, shorten, clean,
} from './parse.js';
import { xlsxToGrid } from './xlsx.js';

const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');

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
