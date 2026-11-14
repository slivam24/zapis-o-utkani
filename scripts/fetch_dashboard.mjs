// Stáhne los aktuálního kola dvou turnajů pro dashboard (dashboard.html).
//
//   node scripts/fetch_dashboard.mjs --out out/dashboard.json [--prev stary.json]
//   node scripts/fetch_dashboard.mjs --set <vlevo> <vpravo>     zapíše turnaje do scripts/dashboard.json
//
// Turnaje se nastavují v scripts/dashboard.json číslem nebo odkazem na chess-results.
// Když se turnaj stáhnout nepodaří, zůstanou jeho předchozí data (z --prev).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHtml, toDocument, sleep } from './chess_results.mjs';
import {
  pageTitle,
  totalRounds,
  isTeamTournament,
  roundLinks,
  parseIndividualRound,
  parseTeamRound,
  individualUrl,
  teamRoundUrl,
  parseTournamentInput,
} from '../js/pairings.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = path.join(ROOT, 'scripts', 'dashboard.json');
const UA = 'zapis-o-utkani-dashboard/1.0 (+https://github.com/slivam24/zapis-o-utkani; los aktualniho kola)';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Stáhne a přečte jeden turnaj. */
export async function fetchTournament(tnr) {
  const html = await fetchHtml(individualUrl(tnr), { ua: UA });
  const doc = toDocument(html);
  const base = {
    tnr,
    title: pageTitle(doc),
    rounds: totalRounds(doc),
  };
  if (isTeamTournament(doc)) {
    const published = roundLinks(doc, 3);
    const rd = Math.max(...published);
    await sleep(1500);
    const round = parseTeamRound(toDocument(await fetchHtml(teamRoundUrl(tnr, rd), { ua: UA })));
    if (!round) throw new Error(`v ${rd}. kole nejsou zápasy`);
    return { ...base, kind: 'team', round: round.round ?? rd, date: round.date, time: round.time, matches: round.matches };
  }
  const round = parseIndividualRound(doc);
  if (!round) throw new Error('na stránce není los kola (turnaj možná ještě není vylosovaný)');
  return { ...base, kind: 'individual', round: round.round, date: round.date, time: round.time, pairings: round.pairings };
}

async function setConfig(a, b) {
  const cfg = (await readJson(CONFIG)) ?? { aktivni: true };
  const vlevo = parseTournamentInput(a);
  const vpravo = parseTournamentInput(b);
  if (!vlevo || !vpravo) {
    console.error('Zadej dvě čísla turnajů nebo odkazy na chess-results.com.');
    return 1;
  }
  const out = { vlevo, vpravo, aktivni: true };
  await fs.writeFile(CONFIG, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Dashboard: vlevo ${vlevo}, vpravo ${vpravo}${cfg.aktivni === false ? ' (znovu zapnuto)' : ''}`);
  return 0;
}

async function main() {
  const setIdx = process.argv.indexOf('--set');
  if (setIdx >= 0) return setConfig(process.argv[setIdx + 1], process.argv[setIdx + 2]);

  const outFile = arg('--out');
  if (!outFile) {
    console.error('Chybí --out <soubor>.');
    return 1;
  }
  const cfg = await readJson(CONFIG);
  const prev = (arg('--prev') && (await readJson(arg('--prev')))) || {};
  const ids = [parseTournamentInput(String(cfg?.vlevo ?? '')), parseTournamentInput(String(cfg?.vpravo ?? ''))];

  const tournaments = {};
  let ok = 0;
  for (const tnr of [...new Set(ids.filter(Boolean))]) {
    const old = prev.tournaments?.[tnr];
    try {
      const t = await fetchTournament(tnr);
      const n = t.pairings?.length ?? t.matches?.length;
      console.log(`tnr${tnr}: ${t.title} – ${t.round}. kolo, ${n} ${t.kind === 'team' ? 'zápasů' : 'partií'}`);
      tournaments[tnr] = { ...t, fetched: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') };
      ok++;
    } catch (e) {
      console.error(`tnr${tnr}: ! ${e.message}`);
      tournaments[tnr] = old ? { ...old, error: e.message } : { tnr, error: e.message };
    }
    await sleep(1500);
  }

  const out = {
    generated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source: 'chess-results.com',
    vlevo: ids[0],
    vpravo: ids[1],
    tournaments,
  };
  await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await fs.writeFile(outFile, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  console.log(`Zapsáno ${outFile} (staženo ${ok} z ${Object.keys(tournaments).length})`);
  return ok || !Object.keys(tournaments).length ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
