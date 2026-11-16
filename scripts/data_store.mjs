// Sdílená data soutěží v repozitáři, rozdělená, aby aplikace nestahovala soupisky celé republiky:
//
//   data/index.json        seznam soutěží bez soupisek (název, kraj, šachovnice, první a poslední kolo)
//   data/comp/<id>.json    jedna soutěž celá: družstva se soupiskami a rozlosování
//
// Aplikace stáhne seznam a soutěž až ve chvíli, kdy ji uživatel vybere (nebo předem soutěže svého kraje).
import fs from 'node:fs/promises';
import path from 'node:path';

const INDEX = 'index.json';
const COMP_DIR = 'comp';
const LEGACY = 'competitions.json';

const readJson = async (file, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const safeId = (id) => {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(id))) throw new Error(`Neplatné id soutěže: ${id}`);
  return String(id);
};

/** Záznam do seznamu: všechno kromě soupisek a rozlosování, k tomu první a poslední kolo. */
export function indexEntry(comp) {
  const { teams, rounds, ...meta } = comp;
  const dates = (rounds ?? []).map((r) => r.date).filter(Boolean).sort();
  return {
    ...meta,
    teamCount: (teams ?? []).length,
    roundCount: (rounds ?? []).length,
    ...(dates.length ? { firstRound: dates[0], lastRound: dates.at(-1) } : {}),
  };
}

/**
 * Načte data z adresáře data/: { season, generated, comps: Map(id → celá soutěž) }.
 * Když nový tvar ještě není, vezme starý soubor data/competitions.json (jednorázový převod).
 */
export async function readData(dir) {
  const index = await readJson(path.join(dir, INDEX));
  if (!index) {
    const legacy = await readJson(path.join(dir, LEGACY), { competitions: [] });
    return {
      season: legacy.season ?? null,
      generated: legacy.generated ?? null,
      comps: new Map((legacy.competitions ?? []).map((c) => [c.id, c])),
    };
  }
  const comps = new Map();
  for (const e of index.competitions ?? []) {
    const full = await readJson(path.join(dir, COMP_DIR, `${safeId(e.id)}.json`));
    if (full) comps.set(e.id, full);
  }
  return { season: index.season ?? null, generated: index.generated ?? null, comps };
}

const json = (x) => `${JSON.stringify(x, null, 1)}\n`;

/**
 * Zapíše data: soubor soutěže jen když se změnil, seznam, smaže soubory odebraných soutěží a starý
 * data/competitions.json. Vrací seznam změněných souborů (prázdný = beze změn).
 */
export async function writeData(dir, { season, comps }, { now = new Date() } = {}) {
  const changed = [];
  await fs.mkdir(path.join(dir, COMP_DIR), { recursive: true });
  const ids = new Set();
  for (const c of comps) {
    const id = safeId(c.id);
    ids.add(id);
    const file = path.join(dir, COMP_DIR, `${id}.json`);
    const body = json(c);
    let old = null;
    try {
      old = await fs.readFile(file, 'utf8');
    } catch {
      /* nová soutěž */
    }
    if (old !== body) {
      await fs.writeFile(file, body, 'utf8');
      changed.push(`${COMP_DIR}/${id}.json`);
    }
  }
  for (const f of await fs.readdir(path.join(dir, COMP_DIR))) {
    if (f.endsWith('.json') && !ids.has(f.slice(0, -5))) {
      await fs.rm(path.join(dir, COMP_DIR, f));
      changed.push(`${COMP_DIR}/${f} (smazáno)`);
    }
  }
  try {
    await fs.rm(path.join(dir, LEGACY));
    changed.push(`${LEGACY} (nahrazeno)`);
  } catch {
    /* už není */
  }
  const oldIndex = await readJson(path.join(dir, INDEX));
  const list = comps.map(indexEntry);
  const same = oldIndex && JSON.stringify({ s: oldIndex.season, c: oldIndex.competitions }) === JSON.stringify({ s: season, c: list });
  if (!same || changed.length) {
    const generated = changed.length || !same ? now.toISOString().replace(/\.\d{3}Z$/, 'Z') : oldIndex.generated;
    await fs.writeFile(path.join(dir, INDEX), json({ generated, source: 'chess-results.com', season, competitions: list }), 'utf8');
    changed.push(INDEX);
  }
  return changed;
}
