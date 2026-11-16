// Načítání sdílených dat: seznam soutěží (data/index.json) a soupisky s rozlosováním jednotlivé soutěže
// (data/comp/<id>.json), ta až když jsou potřeba. Data obnovuje úloha na GitHubu.
// Seznam si aplikace pamatuje v zařízení, soutěže drží mezipaměť aplikace (service worker),
// takže funguje i bez internetu.
import { loadCachedData, saveCachedData, loadUserComps } from './store.js';

const INDEX_URL = 'data/index.json';
const compUrl = (id) => `data/comp/${encodeURIComponent(id)}.json`;

async function fetchJson(url, fresh) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(fresh ? `${url}?t=${Date.now()}` : url, {
      cache: fresh ? 'no-store' : 'default',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIndex(fresh) {
  const json = await fetchJson(INDEX_URL, fresh);
  if (!Array.isArray(json.competitions)) throw new Error('Neplatný formát dat');
  return json;
}

/**
 * Ke staženým soutěžím přidá ty, které si uživatel přidal v aplikaci.
 * Soutěž ze sdílených dat má přednost, protože bývá čerstvější.
 * Sdílené soutěže jsou bez soupisek, ty doplní ensureComp.
 */
export function withUserComps(data) {
  const shared = (data?.competitions ?? []).map((c) => ({ ...c }));
  const known = new Set(shared.map((c) => c.tnr));
  const mine = loadUserComps().filter((c) => !known.has(c.tnr));
  return { ...data, competitions: [...shared, ...mine] };
}

/** Při startu: zkusí síť, jinak použije uloženou kopii seznamu. */
export async function loadData() {
  try {
    const d = await fetchIndex(false);
    saveCachedData(d);
    return { data: withUserComps(d), source: 'network' };
  } catch (e) {
    const cached = loadCachedData();
    if (cached?.competitions?.every((c) => !c.teams)) return { data: withUserComps(cached), source: 'cache', error: e };
    throw e;
  }
}

/** Ruční obnovení (tlačítko): vynutí nové stažení seznamu; soutěže se pak stáhnou znovu. */
export async function refreshData() {
  const d = await fetchIndex(true);
  saveCachedData(d);
  return withUserComps(d);
}

/** Jen přepočítá seznam soutěží, bez sahání na síť (po přidání nebo smazání vlastní soutěže). */
export function reloadUserComps() {
  const cached = loadCachedData();
  return withUserComps(cached?.competitions?.every((c) => !c.teams) ? cached : { competitions: [] });
}

/**
 * Doplní soutěži soupisky a rozlosování (stáhne data/comp/<id>.json). Vrací soutěž, nebo null.
 * Bez internetu vezme kopii z mezipaměti aplikace, když už se soutěž dřív stahovala.
 */
export async function ensureComp(data, id, { fresh = false } = {}) {
  const c = data?.competitions?.find((x) => x.id === id);
  if (!c) return null;
  if (c.local || (Array.isArray(c.teams) && !fresh)) return c;
  const full = await fetchJson(compUrl(id), fresh);
  c.teams = Array.isArray(full.teams) ? full.teams : [];
  c.rounds = Array.isArray(full.rounds) ? full.rounds : [];
  return c;
}

/** Soutěž má soupisky v paměti? */
export const isLoaded = (c) => !!c && (c.local || Array.isArray(c.teams));

export function dataSummary(data) {
  if (!data) return '';
  const teams = data.competitions.reduce((n, c) => n + (c.teams?.length ?? c.teamCount ?? 0), 0);
  const mine = data.competitions.filter((c) => c.local).length;
  const when = data.generated ? new Date(data.generated).toLocaleDateString('cs-CZ') : '?';
  return `Soupisky z ${when} · ${data.competitions.length} soutěží, ${teams} družstev${mine ? ` · ${mine} vlastních` : ''}`;
}
