#!/usr/bin/env node
// Přidá do scripts/competitions.json všechny soutěže družstev kraje, celostátní soutěže nebo celou republiku
// podle seznamu na chess.cz. Spouští se úlohou „Přidat soutěže z chess.cz“ na GitHubu, ručně:
//
//     node scripts/import_chesscz.mjs --kraj UKSS [--rocnik 2026] [--dry-run]
//     node scripts/import_chesscz.mjs --kraj CR            (celostátní soutěže dospělých i mládeže)
//     node scripts/import_chesscz.mjs --kraj vse           (celá republika)
//     node scripts/import_chesscz.mjs --recheck            (doplní počet šachovnic, kde ještě chybí)
//
// U každé soutěže vezme z detailu na chess.cz číslo turnaje na chess-results a z prvního odehraného kola
// počet šachovnic. Soutěž, která v nastavení už je, jen doplní (kraj, odkaz na chess.cz). Soutěž bez odkazu
// na chess-results přeskočí, aplikace z ní nemá odkud vzít soupisky. Když se ještě nehrálo, počet šachovnic
// odhadne a označí (boardsUnverified); páteční aktualizace ho doplní spuštěním s --recheck.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, regionByCode, standardShort, tierOf } from '../js/catalog.js';
import { shorten, splitSeason, titleFromGrid } from '../js/parse.js';
import { xlsxToGrid } from '../js/xlsx.js';
import { fetchExport } from './chess_results.mjs';
import { MAX_COMPETITIONS } from './add_competition.mjs';
import {
  fetchHtml, toDoc, regionUrl, leaguesUrl, detailUrl, parseRegionPage, parseLeagues, parseDetail, detectBoards,
} from './chesscz.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'scripts', 'competitions.json');
const DEFAULT_BOARDS = 8;

function args() {
  const a = process.argv.slice(2);
  const get = (name) => {
    const i = a.indexOf(name);
    return i >= 0 ? a[i + 1] : null;
  };
  return { kraj: get('--kraj'), rocnik: get('--rocnik'), dryRun: a.includes('--dry-run'), recheck: a.includes('--recheck') };
}

/** Kód kraje z výběru v úloze („Ústecký kraj (ÚKŠS)“), ze zkratky (ÚKŠS) i z kódu (UKSS); vse = celá republika. */
export function parseKraj(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^(vse|vše|cela republika|celá republika)/i.test(s)) return 'vse';
  const r =
    REGIONS.find((x) => x.code.toLowerCase() === s.toLowerCase() || x.abbr.toLowerCase() === s.toLowerCase()) ??
    REGIONS.find((x) => s.includes(`(${x.abbr})`)) ??
    (/celost/i.test(s) ? regionByCode('CR') : null);
  return r?.code ?? null;
}

/** Ročník (rok začátku sezóny) z nastavení „2026/2027“, jinak podle data: od července nová sezóna. */
export function seasonYear(cfg, now = new Date()) {
  const m = /^(\d{4})/.exec(cfg?.season ?? '');
  if (m) return Number(m[1]);
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Je turnaj na chess-results z jiné sezóny, než se importuje? Podle názvu („Krajský přebor 2024/2025“).
 * Chess.cz u některých soutěží odkazuje na loňský turnaj. Název bez sezóny se bere jako v pořádku.
 */
export function otherSeason(title, year) {
  // „2024/2025“, „2024/25“ i „2024/5“: začátek sezóny je čtyřmístný rok před lomítkem
  const m = /\b(20\d\d)\s*[/–-]\s*\d{1,4}\b/.exec(title ?? '');
  if (m) return Number(m[1]) !== Number(year);
  const [, season] = splitSeason(title ?? '');
  return season ? !season.startsWith(String(year)) : false;
}

async function chessResultsTitle(tnr) {
  const buf = await fetchExport(tnr, 2, { retries: 2 });
  return buf ? titleFromGrid(await xlsxToGrid(buf)) : '';
}

/** Záznam soutěže pro nastavení. */
export function makeEntry({ chesscz, name, tnr, boards, region, season }) {
  const known = tierOf({ name }).rank < 30;
  return {
    id: `t${tnr}`,
    short: known ? standardShort({ name }) : shorten(name),
    name,
    group: '',
    tnr,
    boards: boards || DEFAULT_BOARDS,
    region,
    chesscz,
    ...(season ? { season } : {}),
    ...(boards ? {} : { boardsUnverified: true }),
  };
}

/** Seznam soutěží jednoho kraje (nebo celostátních) na chess.cz. */
async function listRegion(code, year) {
  if (code === 'CR') return parseLeagues(toDoc(await fetchHtml(leaguesUrl())));
  return parseRegionPage(toDoc(await fetchHtml(regionUrl(regionByCode(code).chesscz, year))));
}

async function importRegion(cfg, code, year, report) {
  const r = regionByCode(code);
  let list;
  try {
    list = await listRegion(code, year);
  } catch (e) {
    report.push(`- ⚠️ ${r.name}: seznam soutěží se nepodařilo stáhnout (${e.message})`);
    return;
  }
  if (!list.length) {
    report.push(`- ${r.name}: na chess.cz žádné soutěže pro ročník ${year}/${year + 1}`);
    return;
  }
  const season = `${year}/${year + 1}`;
  for (const item of list) {
    const label = `${r.abbr}: ${item.name}`;
    let detail;
    try {
      detail = parseDetail(toDoc(await fetchHtml(detailUrl(item.chesscz))));
    } catch (e) {
      report.push(`- ⚠️ ${label}: detail soutěže se nepodařilo stáhnout (${e.message})`);
      continue;
    }
    if (detail.tnr === null) {
      // soutěž, kterou už někdo přidal ručně (odkaz na chess-results zná jen aplikace)
      const known = tierOf({ name: item.name }).rank < 30 && cfg.competitions.find(
        (c) => (c.region ?? code) === code && c.short === standardShort({ name: item.name }),
      );
      if (known) {
        known.region = known.region ?? code;
        known.chesscz = known.chesscz ?? item.chesscz;
        report.push(`- ✔️ ${label}: už v aplikaci (${known.short})`);
      } else report.push(`- ⏭️ ${label}: na chess.cz zatím není odkaz na chess-results, přeskočeno (zkus později znovu)`);
      continue;
    }
    const existing = cfg.competitions.find((c) => c.tnr === detail.tnr);
    if (existing) {
      // už v aplikaci: jen doplnit, co chybí
      existing.region = existing.region ?? code;
      existing.chesscz = existing.chesscz ?? item.chesscz;
      report.push(`- ✔️ ${label}: už v aplikaci (${existing.short})`);
      continue;
    }
    if (cfg.competitions.length >= MAX_COMPETITIONS) {
      report.push(`- ⚠️ ${label}: seznam soutěží je plný (${MAX_COMPETITIONS}), nepřidáno`);
      continue;
    }
    let title = '';
    try {
      title = await chessResultsTitle(detail.tnr);
    } catch {
      /* název se nepodařilo zjistit, sezóna se nekontroluje */
    }
    if (otherSeason(title, year)) {
      report.push(`- ⏭️ ${label}: chess.cz odkazuje na turnaj z jiné sezóny („${title}“), přeskočeno`);
      continue;
    }
    let boards = 0;
    try {
      boards = await detectBoards(item.chesscz, detail.rounds);
    } catch {
      /* počet šachovnic se doplní později */
    }
    const entry = makeEntry({ ...item, tnr: detail.tnr, boards, region: code, season });
    cfg.competitions.push(entry);
    report.push(
      `- ➕ ${label}: přidáno jako **${entry.short}**, ${entry.boards} šachovnic${
        boards ? '' : ' (odhad, ještě se nehrálo; doplní se samo)'
      }`,
    );
  }
}

/** Doplní počet šachovnic u soutěží, kde byl jen odhad. */
async function recheck(cfg, report) {
  for (const c of cfg.competitions.filter((x) => x.boardsUnverified && x.chesscz)) {
    try {
      const { rounds } = parseDetail(toDoc(await fetchHtml(detailUrl(c.chesscz))));
      const n = await detectBoards(c.chesscz, rounds);
      if (n > 0) {
        report.push(`- ${c.short} (${regionByCode(c.region)?.abbr ?? ''}): ${n} šachovnic${n !== c.boards ? ` (bylo ${c.boards})` : ''}`);
        c.boards = n;
        delete c.boardsUnverified;
      }
    } catch {
      /* zkusí se příště */
    }
  }
}

async function main() {
  const a = args();
  const cfg = JSON.parse(await fs.readFile(CONFIG, 'utf8'));
  const before = JSON.stringify(cfg);
  const report = [];
  if (a.recheck) {
    await recheck(cfg, report);
  } else {
    const kraj = parseKraj(a.kraj);
    if (!kraj) {
      console.error(`Nerozumím kraji „${a.kraj ?? ''}“. Zadej kód (UKSS), zkratku (ÚKŠS), CR, nebo vse.`);
      return 1;
    }
    const year = a.rocnik ? Number(a.rocnik) : seasonYear(cfg);
    const codes = kraj === 'vse' ? REGIONS.map((r) => r.code) : [kraj];
    for (const code of codes) await importRegion(cfg, code, year, report);
  }
  console.log(report.length ? report.join('\n') : 'Nic nového.');
  if (!a.dryRun && JSON.stringify(cfg) !== before) {
    await fs.writeFile(CONFIG, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
    console.error('Zapsáno scripts/competitions.json');
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
