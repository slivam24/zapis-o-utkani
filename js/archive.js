// Export a import archivu zápisů. Člověk si tak může vést vlastní archiv v souborech
// (počítač, cloudový disk) a přenést zápisy mezi zařízeními.
export const BACKUP_APP = 'zapis-o-utkani';
export const BACKUP_VERSION = 1;

/** Obsah souboru se zálohou: jeden nebo víc zápisů. */
export function makeBackup(list, { now = new Date() } = {}) {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exported: now.toISOString(), zapisy: list };
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const str = (x) => (typeof x === 'string' ? x : '');
// podpis smí být jen obrázek vložený přímo v souboru, nic jiného se do <img> ani na plátno nedostane
const sigOk = (x) => (typeof x === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(x) ? x : '');

function cleanSide(side) {
  if (!isObj(side)) return null;
  const lineup = Array.isArray(side.lineup) ? side.lineup.filter((p) => isObj(p) && Number.isFinite(p.no)) : [];
  return {
    team: str(side.team),
    captain: str(side.captain),
    lineup: lineup.map((p) => ({
      no: p.no,
      name: str(p.name),
      types: Array.isArray(p.types) ? p.types.filter((t) => typeof t === 'string') : [],
      rtg: Number.isFinite(p.rtg) ? p.rtg : null,
      fide: Number.isFinite(p.fide) ? p.fide : null,
      nat: Number.isFinite(p.nat) ? p.nat : null,
      ...(p.manual ? { manual: true } : {}),
    })),
  };
}

/** Zkontroluje a pročistí jeden zápis ze souboru. Vrací null, když to zápis není. */
export function cleanMatch(m) {
  if (!isObj(m) || typeof m.id !== 'string' || !m.id) return null;
  const home = cleanSide(m.home);
  const away = cleanSide(m.away);
  if (!home || !away) return null;
  const results = {};
  // výsledek šachovnice: kód výsledku a pořadí obou hráčů na soupisce (viz setBoardResult)
  if (isObj(m.results))
    for (const [k, v] of Object.entries(m.results))
      if (/^\d+$/.test(k) && isObj(v) && typeof v.code === 'string' && Number.isFinite(v.h) && Number.isFinite(v.a))
        results[k] = { code: v.code, h: v.h, a: v.a };
  const logos = isObj(m.logos) ? Object.fromEntries(Object.entries(m.logos).filter(([, v]) => typeof v === 'boolean')) : undefined;
  return {
    id: m.id,
    createdAt: str(m.createdAt),
    updatedAt: str(m.updatedAt),
    status: str(m.status) || 'done',
    compId: str(m.compId),
    boards: Number.isInteger(m.boards) ? m.boards : null,
    round: str(String(m.round ?? '')),
    date: str(m.date),
    venue: str(m.venue),
    home,
    away,
    results,
    referee: { name: str(m.referee?.name), role: str(m.referee?.role) || 'delegated' },
    notes: str(m.notes),
    sig: { home: sigOk(m.sig?.home), ref: sigOk(m.sig?.ref), away: sigOk(m.sig?.away) },
    ...(logos ? { logos } : {}),
    ...(isObj(m.compInfo)
      ? {
          compInfo: {
            name: str(m.compInfo.name),
            short: str(m.compInfo.short),
            group: str(m.compInfo.group),
            season: str(m.compInfo.season),
            boards: Number.isInteger(m.compInfo.boards) ? m.compInfo.boards : null,
            teams: [],
            rounds: [],
          },
        }
      : {}),
  };
}

/**
 * Přečte soubor se zálohou. Přijímá zálohu z aplikace, holé pole zápisů (starší záloha)
 * i jeden zápis. Vrací pole pročištěných zápisů; když v souboru žádný není, hodí chybu.
 */
export function parseBackup(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error('Soubor není záloha zápisů (neplatný formát JSON).');
  }
  const raw = Array.isArray(j) ? j : Array.isArray(j?.zapisy) ? j.zapisy : isObj(j) && j.home ? [j] : null;
  if (!raw) throw new Error('V souboru nejsou žádné zápisy.');
  const list = raw.map(cleanMatch).filter(Boolean);
  if (!list.length) throw new Error('V souboru nejsou žádné zápisy, které by šlo načíst.');
  return list;
}

const newest = (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt).localeCompare(String(a.updatedAt));

/**
 * Sloučí nahrané zápisy s archivem. Stejný zápis (stejné id) se nahradí jen novější verzí.
 * Vrací nový seznam a počty přidaných, aktualizovaných a přeskočených.
 */
export function mergeArchive(existing, incoming) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const m of incoming) {
    const old = byId.get(m.id);
    if (!old) {
      byId.set(m.id, m);
      added++;
    } else if (String(m.updatedAt) > String(old.updatedAt)) {
      byId.set(m.id, m);
      updated++;
    } else skipped++;
  }
  return { list: [...byId.values()].sort(newest), added, updated, skipped };
}

/** Zápisy hrané před víc než `months` měsíci. */
export function olderThan(list, months, now = new Date()) {
  if (!months) return [];
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - months);
  const iso = limit.toLocaleDateString('sv-SE');
  return list.filter((m) => m.date && m.date < iso);
}
