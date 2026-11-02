// Načítání soupisek a rozlosování ze sdílených dat (data/competitions.json). Ta obnovuje úloha
// na GitHubu. Aplikace si poslední stažená data pamatuje, takže funguje i bez internetu.
import { loadCachedData, saveCachedData, loadUserComps } from './store.js';

const URL = 'data/competitions.json';

async function fetchJson(fresh) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(fresh ? `${URL}?t=${Date.now()}` : URL, {
      cache: fresh ? 'no-store' : 'default',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.competitions)) throw new Error('Neplatný formát dat');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ke staženým soutěžím přidá ty, které si uživatel přidal v aplikaci.
 * Soutěž ze sdílených dat má přednost, protože bývá čerstvější.
 */
export function withUserComps(data) {
  const shared = data?.competitions ?? [];
  const known = new Set(shared.map((c) => c.tnr));
  const mine = loadUserComps().filter((c) => !known.has(c.tnr));
  return { ...data, competitions: [...shared, ...mine] };
}

/** Při startu: zkusí síť, jinak použije uloženou kopii. */
export async function loadData() {
  try {
    const d = await fetchJson(false);
    saveCachedData(d);
    return { data: withUserComps(d), source: 'network' };
  } catch (e) {
    const cached = loadCachedData();
    if (cached) return { data: withUserComps(cached), source: 'cache', error: e };
    throw e;
  }
}

/** Ruční obnovení (tlačítko): vynutí nové stažení. */
export async function refreshData() {
  const d = await fetchJson(true);
  saveCachedData(d);
  return withUserComps(d);
}

/** Jen přepočítá seznam soutěží, bez sahání na síť (po přidání nebo smazání vlastní soutěže). */
export function reloadUserComps() {
  return withUserComps(loadCachedData() ?? { competitions: [] });
}

export function dataSummary(data) {
  if (!data) return '';
  const teams = data.competitions.reduce((n, c) => n + c.teams.length, 0);
  const mine = data.competitions.filter((c) => c.local).length;
  const when = data.generated ? new Date(data.generated).toLocaleDateString('cs-CZ') : '?';
  return `Soupisky z ${when} · ${teams} družstev${mine ? ` · ${mine} vlastních soutěží` : ''}`;
}
