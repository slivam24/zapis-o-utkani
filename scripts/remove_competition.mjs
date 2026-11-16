#!/usr/bin/env node
// Odebere soutěž ze sdílených dat (scripts/competitions.json a data/competitions.json).
// Spouští se úlohou „Odebrat soutěž“ na GitHubu (Actions → Run workflow), ručně:
//
//     node scripts/remove_competition.mjs "KP II A"
//
// Soutěž jde zadat zkratkou, id, číslem turnaje nebo odkazem na chess-results. Když zadání sedí
// na víc soutěží (stejná zkratka ve dvou krajích), nic se nesmaže a vypíšou se, ať jde vybrat přesně.
// Zápisy, které už lidé mají v archivu, se tím nemění: nesou si údaje o soutěži s sebou.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tournamentNumber } from '../js/parse.js';
import { regionByCode } from '../js/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'scripts', 'competitions.json');
const DATA = path.join(ROOT, 'data', 'competitions.json');

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Soutěže, které odpovídají zadání. */
export function findCompetitions(list, query) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const tnr = tournamentNumber(q) ?? (/^\d{4,9}$/.test(q) ? Number(q) : null);
  if (tnr !== null) return list.filter((c) => c.tnr === tnr);
  const byId = list.filter((c) => c.id === q);
  if (byId.length) return byId;
  return list.filter((c) => norm(c.short) === norm(q) || norm(c.name) === norm(q));
}

const describe = (c) =>
  `${c.short} (${c.name}${c.group ? ` ${c.group}` : ''}, ${regionByCode(c.region)?.abbr ?? 'bez kraje'}, id ${c.id}, turnaj ${c.tnr})`;

async function main() {
  const query = process.argv.slice(2).join(' ');
  const cfg = JSON.parse(await fs.readFile(CONFIG, 'utf8'));
  const found = findCompetitions(cfg.competitions, query);
  if (!found.length) {
    console.error(`Soutěž „${query}“ jsem nenašel. Soutěže v aplikaci:`);
    for (const c of cfg.competitions) console.error(`  - ${describe(c)}`);
    return 1;
  }
  if (found.length > 1) {
    console.error(`Zadání „${query}“ sedí na víc soutěží, zadej přesně id nebo číslo turnaje:`);
    for (const c of found) console.error(`  - ${describe(c)}`);
    return 1;
  }
  const [gone] = found;
  cfg.competitions = cfg.competitions.filter((c) => c.id !== gone.id);
  await fs.writeFile(CONFIG, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  try {
    const data = JSON.parse(await fs.readFile(DATA, 'utf8'));
    data.competitions = (data.competitions ?? []).filter((c) => c.id !== gone.id);
    await fs.writeFile(DATA, `${JSON.stringify(data, null, 1)}\n`, 'utf8');
  } catch {
    /* data ještě nejsou, stačí nastavení */
  }
  console.log(`Odebráno: ${describe(gone)}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
