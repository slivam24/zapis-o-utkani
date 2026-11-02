#!/usr/bin/env node
// Stáhne soupisky a rozlosování z chess-results.com do data/competitions.json.
// Spouští se automaticky každý pátek (GitHub Actions), ručně:
//
//     node scripts/fetch_data.mjs [--only <id>] [--save-html raw]
//
// Stahuje se jen pár stránek jednou týdně, mezi požadavky je prodleva.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRosters, parseRounds, parseRostersFromGrid, parseRoundsFromGrid } from '../js/parse.js';
import { xlsxToGrid } from '../js/xlsx.js';
import { fetchPage, fetchExport, toDocument, sleep } from './chess_results.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'scripts', 'competitions.json');
const OUT = path.join(ROOT, 'data', 'competitions.json');

function args() {
  const a = process.argv.slice(2);
  const get = (name) => {
    const i = a.indexOf(name);
    return i >= 0 ? a[i + 1] : null;
  };
  return { only: get('--only'), saveHtml: get('--save-html') };
}

const readJson = async (file, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
};

async function main() {
  const { only, saveHtml } = args();
  const cfg = await readJson(CONFIG);
  if (!cfg?.competitions?.length) {
    console.error('Nastavení soutěží chybí nebo je prázdné.');
    return 1;
  }
  const prevJson = await readJson(OUT, { competitions: [] });
  const previous = new Map((prevJson.competitions ?? []).map((c) => [c.id, c]));
  if (saveHtml) await fs.mkdir(path.resolve(saveHtml), { recursive: true });

  if (only && !cfg.competitions.some((c) => c.id === only)) {
    console.error(`Soutěž ${only} není v nastavení.`);
    return 1;
  }

  const comps = [];
  let ok = 0;
  for (const c of cfg.competitions) {
    const old = previous.get(c.id) ?? {};
    const comp = {
      ...c,
      season: c.season || cfg.season,
      url: `https://chess-results.com/tnr${c.tnr}.aspx?lan=5`,
    };
    if (only && c.id !== only) {
      comp.teams = old.teams ?? [];
      comp.rounds = old.rounds ?? [];
      comps.push(comp);
      if (comp.teams.length) ok++;
      continue;
    }

    console.log(`${c.short} (tnr${c.tnr})`);
    let teams = [];
    let rounds = [];
    const sources = [];
    const raw = saveHtml ? path.resolve(saveHtml) : null;
    try {
      // Přednost má export do Excelu: je to stabilnější rozhraní než stránka a desetkrát menší
      // přenos. Když export nevyjde, čte se stránka jako dřív.
      const rosterXlsx = await fetchExport(c.tnr, 8);
      if (rosterXlsx) {
        if (raw) await fs.writeFile(path.join(raw, `${c.id}_art8.xlsx`), Buffer.from(rosterXlsx));
        teams = parseRostersFromGrid(await xlsxToGrid(rosterXlsx)).filter((t) => t.players.length);
        if (teams.length >= 2) sources.push('soupisky: export');
      }
      if (teams.length < 2) {
        const rosterHtml = await fetchPage(c.tnr, 8);
        if (raw) await fs.writeFile(path.join(raw, `${c.id}_art8.html`), rosterHtml);
        teams = parseRosters(toDocument(rosterHtml)).filter((t) => t.players.length);
        if (teams.length >= 2) sources.push('soupisky: stránka');
      }
      await sleep(2000);

      if (teams.length >= 2) {
        const names = teams.map((t) => t.name);
        const drawXlsx = await fetchExport(c.tnr, 2);
        if (drawXlsx) {
          if (raw) await fs.writeFile(path.join(raw, `${c.id}_art2.xlsx`), Buffer.from(drawXlsx));
          rounds = parseRoundsFromGrid(await xlsxToGrid(drawXlsx), names);
          if (rounds.length) sources.push('rozlosování: export');
        }
        if (!rounds.length) {
          const drawHtml = await fetchPage(c.tnr, 2);
          if (raw) await fs.writeFile(path.join(raw, `${c.id}_art2.html`), drawHtml);
          rounds = parseRounds(toDocument(drawHtml), names);
          if (rounds.length) sources.push('rozlosování: stránka');
        }
        await sleep(2000);
      }
    } catch (e) {
      console.error(`  ! ${e.message}`);
    }
    if (sources.length) console.log(`  zdroj: ${sources.join(', ')}`);

    if (teams.length < 2) {
      console.error('  ! soupisky nenalezeny, ponechávám předchozí data');
      teams = old.teams ?? [];
      rounds = old.rounds ?? [];
    } else {
      ok++;
      const short = teams.filter((t) => t.players.length < c.boards).map((t) => t.name);
      if (short.length) console.error(`  ! méně hráčů než šachovnic: ${short.join(', ')}`);
      if (!rounds.length) {
        console.error('  ! rozlosování nenalezeno, ponechávám předchozí');
        rounds = old.rounds ?? [];
      }
    }
    comp.teams = teams;
    comp.rounds = rounds;
    const players = teams.reduce((n, t) => n + t.players.length, 0);
    console.log(`  družstev: ${teams.length}, hráčů: ${players}, kol: ${rounds.length}`);
    comps.push(comp);
  }

  if (!ok) {
    console.error('Nepodařilo se načíst žádnou soutěž.');
    return 1;
  }

  const body = { season: cfg.season, competitions: comps };
  const oldBody = { season: prevJson.season ?? null, competitions: prevJson.competitions ?? null };
  if (JSON.stringify(oldBody) === JSON.stringify(body)) {
    console.log('Beze změn, soubor se nepřepisuje.');
    return 0;
  }
  const out = { generated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), source: 'chess-results.com', ...body };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  console.log('Zapsáno data/competitions.json');
  return 0;
}

process.exit(await main());
