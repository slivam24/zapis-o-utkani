// Aktuální ratingy z Listiny osobních koeficientů (LOK) ŠSČR, kterou vydává elo.miramal.com.
//
// Na soupiskách chess.cz i chess-results je Elo z přihlášek na začátku soutěže. Úloha Aktualizace
// soupisek proto k hráčům doplní aktuální národní Elo a FIDE z LOK. Hráči se párují přesně:
// podle ID hráče z chess.cz (číslo v odkazu chess.cz/hrac/<ID>/ je ID v LOK), u soupisek
// z chess-results podle FIDE ID. Podle jména se nepáruje, v LOK je spousta jmenovců.
import { xlsToGrid } from './xls.mjs';

export const LOK_URL = 'https://elo.miramal.com/download/lok_sm_cz.xls';
const COLUMNS = ['ID_no', 'Name', 'Rtg_nat', 'Rtg_int', 'FIDE_no'];
const MIN_PLAYERS = 1000; // pojistka proti prázdné nebo useknuté listině

const int = (v) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

/**
 * Listina LOK ze souboru .xls: { byId: Map(ID → hráč), byFide: Map(FIDE ID → hráč), size }.
 * min je nejmenší rozumný počet hráčů (skutečná listina jich má přes 26 000).
 */
export function readLok(buffer, { min = MIN_PLAYERS } = {}) {
  const grid = xlsToGrid(buffer);
  const head = (grid[0] ?? []).map((h) => String(h).trim());
  const missing = COLUMNS.filter((c) => !head.includes(c));
  if (missing.length) throw new Error(`Neočekávaný formát LOK, chybí sloupce: ${missing.join(', ')}`);
  const col = Object.fromEntries(COLUMNS.map((c) => [c, head.indexOf(c)]));
  const byId = new Map();
  const byFide = new Map();
  for (const row of grid.slice(1)) {
    const id = int(row[col.ID_no]);
    const name = String(row[col.Name] ?? '').split(/\s+/).filter(Boolean).join(' ');
    if (!id || !name) continue;
    const p = { id, name, nat: int(row[col.Rtg_nat]), fide: int(row[col.Rtg_int]), fideId: int(row[col.FIDE_no]) };
    byId.set(id, p);
    if (p.fideId) byFide.set(p.fideId, p);
  }
  if (byId.size < min) throw new Error(`Listina LOK má jen ${byId.size} hráčů, vypadá poškozeně.`);
  return { byId, byFide, size: byId.size };
}

/** Stáhne a přečte LOK. */
export async function fetchLok(url = LOK_URL) {
  const res = await fetch(url, { headers: { 'User-Agent': 'zapis-o-utkani (aktualizace soupisek)' } });
  if (!res.ok) throw new Error(`LOK: HTTP ${res.status}`);
  return readLok(await res.arrayBuffer());
}

/** Jméno bez diakritiky, interpunkce a rozdílů ve velikosti písmen („Kriz, Denis“ = „Kříž Denis“). */
const plain = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Doplní hráčům v družstvech aktuální ratingy z LOK (mění objekty na místě).
 * - národní Elo a FIDE se přepíší, když je LOK má; když je LOK nemá, zůstanou ze soupisky,
 * - neoznačené Elo z chess-results (rtg) se zahodí, jakmile je z LOK známé národní nebo FIDE,
 * - jméno se vezme z LOK, jen když se liší jen diakritikou, velikostí písmen nebo tvarem („Novak, Jan“).
 * Vrací počty { players, matched, rating, name }.
 */
export function applyLok(teams, lok) {
  const stats = { players: 0, matched: 0, rating: 0, name: 0 };
  for (const team of teams ?? []) {
    for (const p of team.players ?? []) {
      stats.players++;
      const l = (p.id && lok.byId.get(p.id)) || (p.fideId && lok.byFide.get(p.fideId)) || null;
      if (!l) continue;
      stats.matched++;
      const before = [p.rtg, p.nat, p.fide].join('|');
      if (l.nat) p.nat = l.nat;
      if (l.fide) p.fide = l.fide;
      if ((l.nat || l.fide) && p.rtg != null) p.rtg = null;
      if ([p.rtg, p.nat, p.fide].join('|') !== before) stats.rating++;
      if (p.name !== l.name && plain(p.name) === plain(l.name)) {
        if (team.captain === p.name) team.captain = l.name;
        p.name = l.name;
        stats.name++;
      }
    }
  }
  return stats;
}
