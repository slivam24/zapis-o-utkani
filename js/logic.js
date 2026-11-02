// Čistá logika zápisu o utkání (bez DOM), použitelná v prohlížeči i v Node (testy).
// Pravidla vycházejí ze Soutěžního řádu ŠSČR: čl. 3.6.2 (sestava), 3.6.3 (hosté, volní hráči, cizinci),
// 3.4.1 (barvy), 5.1 a 5.3.1 (hodnocení partií a utkání).

export const RESULTS = {
  W: { label: '1 : 0', h: '1', a: '0', hp: 1, ap: 0, forfeit: false },
  D: { label: '½ : ½', h: '½', a: '½', hp: 0.5, ap: 0.5, forfeit: false },
  L: { label: '0 : 1', h: '0', a: '1', hp: 0, ap: 1, forfeit: false },
  WK: { label: '1K : 0K', h: '1K', a: '0K', hp: 1, ap: 0, forfeit: true },
  XK: { label: '0K : 0K', h: '0K', a: '0K', hp: 0, ap: 0, forfeit: true },
  LK: { label: '0K : 1K', h: '0K', a: '1K', hp: 0, ap: 1, forfeit: true },
};

export const REFEREE_ROLES = {
  delegated: 'delegovaný rozhodčí',
  substitute: 'náhradní rozhodčí',
  captain: 'kapitán domácího družstva',
};

/** Typy, které se počítají do limitu z čl. 3.6.3 (host, volný hráč, cizinec). */
const RESTRICTED = ['H', 'V', 'C'];

/** "Z,ZK" -> ['ZK'], "Z,H" -> ['H'], "Z" -> []  (Z = základní sestava, nezobrazuje se). */
export function parseTypes(raw) {
  return String(raw ?? '')
    .split(/[,\s/]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s && s !== 'Z');
}

export function typeLabel(types) {
  return (types ?? []).join(', ');
}

export function isRestricted(player) {
  return (player?.types ?? []).some((t) => RESTRICTED.includes(t));
}

export function restrictedCount(lineup) {
  return lineup.filter(isRestricted).length;
}

/** Nejvyšší povolený počet hostů+volných+cizinců: méně než polovina (8 -> 3, 5 -> 2). */
export function maxRestricted(boards) {
  return Math.ceil(boards / 2) - 1;
}

/** Nejmenší povolený počet hráčů v sestavě: alespoň polovina (8 -> 4, 5 -> 3). */
export function minPlayers(boards) {
  return Math.ceil(boards / 2);
}

/** Domácí hrají bílými na lichých šachovnicích (čl. 3.4.1). */
export function homeIsWhite(board) {
  return board % 2 === 1;
}

export function sortedLineup(lineup) {
  return [...(lineup ?? [])].sort((a, b) => a.no - b.no);
}

export function fmtPoints(p) {
  const whole = Math.floor(p);
  const half = p - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return iso ?? '';
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

export function fmtRating(n) {
  return Number.isFinite(n) && n > 0 ? String(n) : '';
}

/** Výsledek šachovnice, který lze určit automaticky (chybějící hráč => kontumace). */
export function autoResult(homePlayer, awayPlayer) {
  if (homePlayer && awayPlayer) return null;
  if (homePlayer) return 'WK';
  if (awayPlayer) return 'LK';
  return 'XK';
}

/** Výsledek šachovnice `board` (1..boards) nebo null, pokud ještě není zadán. */
export function boardResult(state, board) {
  const hp = sortedLineup(state.home.lineup)[board - 1];
  const ap = sortedLineup(state.away.lineup)[board - 1];
  const auto = autoResult(hp, ap);
  if (auto) return auto;
  const r = state.results?.[board];
  return r && r.h === hp.no && r.a === ap.no && RESULTS[r.code] ? r.code : null;
}

export function setBoardResult(state, board, code) {
  const hp = sortedLineup(state.home.lineup)[board - 1];
  const ap = sortedLineup(state.away.lineup)[board - 1];
  if (!hp || !ap) return;
  state.results = state.results ?? {};
  if (!code || !RESULTS[code]) delete state.results[board];
  else state.results[board] = { code, h: hp.no, a: ap.no };
}

export function totals(state, boards) {
  let home = 0;
  let away = 0;
  let missing = [];
  for (let b = 1; b <= boards; b++) {
    const code = boardResult(state, b);
    if (!code) {
      missing.push(b);
      continue;
    }
    home += RESULTS[code].hp;
    away += RESULTS[code].ap;
  }
  return { home, away, missing };
}

export function newMatch({ today } = {}) {
  const t = today ?? new Date().toLocaleDateString('sv-SE');
  return {
    id: `z${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    compId: '',
    round: '',
    date: t,
    venue: '',
    home: { team: '', lineup: [], captain: '' },
    away: { team: '', lineup: [], captain: '' },
    results: {},
    referee: { name: '', role: 'delegated' },
    notes: '',
    sig: { home: '', ref: '', away: '' },
  };
}

/** Výchozí kapitán družstva: hráč s typem K, jinak jméno z hlavičky soupisky. */
export function defaultCaptain(team) {
  if (!team) return '';
  const k = team.players?.find((p) => p.types?.includes('K'));
  return k ? k.name : team.captain ?? '';
}

/**
 * Kontrola zápisu. Vrací pole {level: 'error'|'warn'|'info', text}.
 * 'error' = porušení řádu nebo chybějící povinný údaj, 'warn' = stojí za kontrolu.
 */
export function validate(state, comp, { forFinal = false } = {}) {
  const issues = [];
  const boards = comp?.boards ?? 8;
  const add = (level, text) => issues.push({ level, text });

  if (!state.compId) add('error', 'Není vybraná soutěž.');
  if (!state.home.team || !state.away.team) add('error', 'Vyber domácí i hostující družstvo.');
  else if (state.home.team === state.away.team) add('error', 'Domácí a hostující družstvo je stejné.');
  if (!state.date) add('error', 'Chybí datum utkání.');
  if (!state.venue?.trim()) add('warn', 'Chybí hrací místnost.');
  if (!String(state.round ?? '').trim()) add('warn', 'Chybí číslo kola.');

  for (const [side, label] of [
    ['home', 'Domácí'],
    ['away', 'Hosté'],
  ]) {
    const lineup = state[side].lineup;
    if (lineup.length === 0) add('error', `${label}: sestava je prázdná.`);
    else if (lineup.length < minPlayers(boards))
      add('error', `${label}: v sestavě je ${lineup.length} hráčů, nejméně ${minPlayers(boards)} (čl. 3.6.2).`);
    if (lineup.length > boards) add('error', `${label}: v sestavě je více než ${boards} hráčů.`);
    const r = restrictedCount(lineup);
    if (r > maxRestricted(boards))
      add(
        'error',
        `${label}: hostů, volných hráčů a cizinců je ${r}, povoleno nejvýše ${maxRestricted(boards)} (čl. 3.6.3).`,
      );
    if (!state[side].captain?.trim()) add('warn', `${label}: chybí jméno kapitána.`);
  }

  const t = totals(state, boards);
  if (t.missing.length) add('error', `Chybí výsledek na šachovnicích: ${t.missing.join(', ')}.`);

  if (!state.referee?.name?.trim()) add('error', 'Chybí jméno rozhodčího.');

  if (forFinal) {
    const names = { home: 'kapitána domácích', ref: 'rozhodčího', away: 'kapitána hostů' };
    for (const k of ['home', 'ref', 'away']) {
      if (!state.sig?.[k]) add('warn', `Chybí podpis ${names[k]}.`);
    }
  }
  return issues;
}

export function hasErrors(issues) {
  return issues.some((i) => i.level === 'error');
}

/** Bezpečný název souboru bez diakritiky. */
export function slug(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function fileBase(state, comp) {
  const parts = [
    'zapis',
    state.date,
    comp?.short ? slug(comp.short) : '',
    state.round ? `kolo${slug(state.round)}` : '',
    slug(state.home.team),
    slug(state.away.team),
  ].filter(Boolean);
  return parts.join('_').slice(0, 120);
}
