// Načítání soupisek a rozlosování. Soubor data/competitions.json se každý pátek obnovuje automaticky
// (GitHub Actions). Aplikace si poslední stažená data pamatuje, takže funguje i bez internetu.
import { loadCachedData, saveCachedData } from './store.js';

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

/** Při startu: zkusí síť, jinak použije uloženou kopii. */
export async function loadData() {
  try {
    const d = await fetchJson(false);
    saveCachedData(d);
    return { data: d, source: 'network' };
  } catch (e) {
    const cached = loadCachedData();
    if (cached) return { data: cached, source: 'cache', error: e };
    throw e;
  }
}

/** Ruční obnovení (tlačítko): vynutí nové stažení. */
export async function refreshData() {
  const d = await fetchJson(true);
  saveCachedData(d);
  return d;
}

export function dataSummary(data) {
  if (!data) return '';
  const teams = data.competitions.reduce((n, c) => n + c.teams.length, 0);
  const when = data.generated ? new Date(data.generated).toLocaleDateString('cs-CZ') : '?';
  return `Soupisky z ${when} · ${teams} družstev`;
}
