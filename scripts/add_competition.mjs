#!/usr/bin/env node
// Přidá soutěž z chess-results.com do scripts/competitions.json.
//
//     node scripts/add_competition.mjs --url https://chess-results.com/tnr1507857.aspx --boards 8
//     node scripts/add_competition.mjs --from-issue        (text hlášení v proměnné ISSUE_BODY)
//
// Na výstup píše zprávu v markdownu, kterou úloha vloží jako odpověď do hlášení.
// Návratové kódy: 0 přidáno, 1 chyba k nahlášení, 2 nejde o žádost o soutěž (mlčky ignorovat).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRosters, splitSeason, tournamentTitle, tournamentNumber, shorten, clean } from '../js/parse.js';
import { fetchPage, toDocument } from './chess_results.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'scripts', 'competitions.json');

export const MAX_COMPETITIONS = 60;
export const MIN_BOARDS = 2;
export const MAX_BOARDS = 16;
const NO_RESPONSE = new Set(['_no response_', '_bez odpovědi_', '', '-']);

export class Refused extends Error {}

export function parseBoards(raw) {
  const m = /\d{1,2}/.exec(raw ?? '');
  if (!m) throw new Refused('Nerozumím počtu šachovnic.');
  const n = Number(m[0]);
  if (n < MIN_BOARDS || n > MAX_BOARDS) {
    throw new Refused(`Počet šachovnic musí být mezi ${MIN_BOARDS} a ${MAX_BOARDS}, dostal jsem ${n}.`);
  }
  return n;
}

export function cleanShort(raw) {
  const s = clean(raw);
  if (NO_RESPONSE.has(s.toLowerCase())) return '';
  return s.replace(/[^\p{L}\p{N} .'"„“()/-]/gu, '').slice(0, 24).trim();
}

/** Přečte hodnoty z hlášení podle šablony (nadpisy '### ...'). */
export function parseIssueBody(body) {
  if (!body || !/^###\s*Odkaz na turnaj\s*$/im.test(body)) {
    throw new RangeError('Hlášení není žádost o přidání soutěže.');
  }
  const fields = new Map();
  let current = null;
  let buf = [];
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^###\s*(.+?)\s*$/.exec(line);
    if (h) {
      if (current) fields.set(current, buf.join('\n').trim());
      current = h[1].toLowerCase();
      buf = [];
    } else if (current !== null) buf.push(line);
  }
  if (current) fields.set(current, buf.join('\n').trim());

  const get = (name) => {
    for (const [k, v] of fields) if (k.startsWith(name.toLowerCase())) return v;
    return '';
  };
  return { url: get('odkaz na turnaj'), boards: get('počet šachovnic'), short: get('zkratka') };
}

/** Stáhne stránku turnaje a ověří, že jde o soutěž družstev. */
export async function probe(tnr) {
  let html;
  try {
    html = await fetchPage(tnr, 8, { retries: 2 });
  } catch (e) {
    throw new Refused(`Stránku turnaje se nepodařilo načíst: ${e.message}`);
  }
  const doc = toDocument(html);
  const teams = parseRosters(doc).filter((t) => t.players.length);
  if (teams.length < 2) {
    throw new Refused(
      'Na stránce turnaje nejsou soupisky družstev. Vypadá to na turnaj jednotlivců, ten aplikace nepodporuje.',
    );
  }
  const title = tournamentTitle(doc);
  if (!title) throw new Refused('Ze stránky se nepodařilo přečíst název soutěže. Napiš ho prosím do hlášení ručně.');
  const [name, season] = splitSeason(title);
  return {
    name: name || `Turnaj ${tnr}`,
    season,
    teams: teams.length,
    players: teams.reduce((n, t) => n + t.players.length, 0),
  };
}

export function addEntry(cfg, tnr, boards, short, info) {
  const existing = cfg.competitions.find((c) => c.tnr === tnr);
  if (existing) throw new Refused(`Tahle soutěž už v aplikaci je, vedená jako **${existing.short}**.`);
  if (cfg.competitions.length >= MAX_COMPETITIONS) {
    throw new Refused(`Seznam soutěží je plný (${MAX_COMPETITIONS}). Napiš to prosím do hlášení bez šablony.`);
  }
  const entry = {
    id: `t${tnr}`,
    short: short || shorten(info.name),
    name: info.name,
    group: '',
    tnr,
    boards,
  };
  if (info.season) entry.season = info.season;
  cfg.competitions.push(entry);
  return entry;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (name) => {
    const i = a.indexOf(name);
    return i >= 0 ? a[i + 1] : null;
  };
  return {
    url: get('--url'),
    boards: get('--boards'),
    short: get('--short') ?? '',
    fromIssue: a.includes('--from-issue'),
    dryRun: a.includes('--dry-run'),
    idFile: get('--id-file'),
  };
}

async function main() {
  const args = parseArgs();
  let raw;
  if (args.fromIssue) {
    try {
      raw = parseIssueBody(process.env.ISSUE_BODY ?? '');
    } catch {
      return 2;
    }
  } else {
    if (!args.url || !args.boards) {
      console.error('--url a --boards jsou povinné');
      return 1;
    }
    raw = { url: args.url, boards: args.boards, short: args.short };
  }

  let entry;
  let info;
  let cfg;
  try {
    const tnr = tournamentNumber(raw.url);
    if (tnr === null) {
      throw new Refused(
        'Odkaz nevede na turnaj na chess-results.com. Čekám adresu ve tvaru `https://chess-results.com/tnr1507857.aspx`.',
      );
    }
    const boards = parseBoards(raw.boards);
    const short = cleanShort(raw.short);
    cfg = JSON.parse(await fs.readFile(CONFIG, 'utf8'));
    const dup = cfg.competitions.find((c) => c.tnr === tnr);
    if (dup) throw new Refused(`Tahle soutěž už v aplikaci je, vedená jako **${dup.short}**.`);
    info = await probe(tnr);
    entry = addEntry(cfg, tnr, boards, short, info);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    console.log(`Soutěž jsem nepřidal.\n\n${e.message}`);
    return 1;
  }

  if (!args.dryRun) {
    await fs.writeFile(CONFIG, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
    if (args.idFile) await fs.writeFile(args.idFile, entry.id, 'utf8');
  }

  console.log(
    [
      'Hotovo, soutěž je přidaná.',
      '',
      `- **Název:** ${entry.name}`,
      `- **Zkratka v aplikaci:** ${entry.short}`,
      `- **Sezóna:** ${entry.season ?? 'podle nastavení'}`,
      `- **Šachovnic:** ${entry.boards}`,
      `- **Načteno:** ${info.teams} družstev, ${info.players} hráčů`,
      '',
      'Soupisky se teď stáhnou a soutěž se objeví v nabídce v aplikaci.',
    ].join('\n'),
  );
  console.error(`::notice::pridano ${entry.id}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
