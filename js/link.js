// Přenos zápisu odkazem (QR kódem) na jiné zařízení, typicky z notebooku na telefon k podpisu.
// Bez serveru: zápis je zkomprimovaný přímo v odkazu, v části za „#“, kterou prohlížeč na server neposílá.
//
// Dva formáty:
//  #z=2.  krátký: hráči jen jako pořadí na soupisce, kterou má telefon ve stejných datech; kontrolní součet
//         hlídá, že jsou soupisky na obou zařízeních stejné. QR kód je pak několikanásobně menší.
//  #z=1.  úplný: celý zápis. Pro soutěže, které telefon v datech mít nemusí (přidané v zařízení).
// Podpisy se nepřenášejí nikdy, podepisuje se až na telefonu.
import { cleanMatch } from './archive.js';
import { newMatch, setBoardResult, boardResult, defaultCaptain, DEFAULT_LOGOS } from './logic.js';

const PREFIX1 = '#z=1.';
const PREFIX2 = '#z=2.';

function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function through(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Prázdné hodnoty se do odkazu nepíšou, QR kód je pak menší. */
const compact = (key, value) =>
  value === null || value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value;

async function pack(prefix, obj, base) {
  const json = new TextEncoder().encode(JSON.stringify(obj, compact));
  return `${base}${prefix}${toB64url(await through(json, new CompressionStream('deflate-raw')))}`;
}

async function unpack(text) {
  try {
    const json = await through(fromB64url(text), new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error('Odkaz se zápisem je poškozený. Naskenuj QR kód znovu.');
  }
}

export const hasLink = (hash) => typeof hash === 'string' && (hash.startsWith(PREFIX1) || hash.startsWith(PREFIX2));

// ---------- krátký formát ----------
const RES_CHAR = { W: '1', D: '=', L: '0', WK: '+', XK: 'x', LK: '-' };
const CHAR_RES = Object.fromEntries(Object.entries(RES_CHAR).map(([k, v]) => [v, k]));

/** Otisk hráče: když se na telefonu liší cokoli z toho, soupisky nejsou stejné. */
const playerKey = (p) => [p.no, p.name, p.rtg ?? '', p.nat ?? '', p.fide ?? '', (p.types ?? []).join(',')].join('|');

/** Krátký kontrolní součet (FNV-1a, 32 bitů). */
function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Soutěž, kterou má telefon ve sdílených datech: jen ta jde poslat krátce. */
const isShared = (comp) => !!comp && !comp.local && Array.isArray(comp.teams) && comp.teams.length > 0;

function packSide(side, team, teamIndex) {
  const lineup = side.lineup.map((p) => {
    const r = team?.players?.find((x) => x.no === p.no);
    if (r && !p.manual && playerKey(r) === playerKey(p)) return p.no;
    // hráč mimo soupisku nebo upravený: celý
    return { n: p.no, m: p.name, g: p.rtg, t: p.nat, f: p.fide, y: p.types, ...(p.manual ? { u: 1 } : {}) };
  });
  const fromRoster = side.lineup.filter((p, i) => typeof lineup[i] === 'number');
  // družstvo pořadím v soutěži (kratší než název); bez hráčů ze soupisky by kontrolní součet záměnu
  // družstva nepoznal, pak jde název
  const byIndex = team && fromRoster.length > 0;
  // kapitán jen když není ten ze soupisky; prázdný jako 0, aby ho telefon nedoplnil
  const captain = team && side.captain === defaultCaptain(team) ? undefined : side.captain || 0;
  return {
    ...(byIndex ? { i: teamIndex } : { t: side.team }),
    k: captain,
    l: lineup,
    s: fromRoster.length ? checksum(fromRoster.map(playerKey).join(';')) : '',
  };
}

function packShort(state, comp, boards) {
  const idx = (name) => comp.teams.findIndex((t) => t.name === name);
  const side = (sd) => packSide(sd, comp.teams[idx(sd.team)], idx(sd.team));
  let res = '';
  for (let b = 1; b <= boards; b++) {
    const r = state.results?.[b];
    res += r && boardResult(state, b) === r.code && RES_CHAR[r.code] ? RES_CHAR[r.code] : '.';
  }
  const logos = Object.entries(state.logos ?? {}).some(([k, v]) => DEFAULT_LOGOS[k] !== v) ? state.logos : undefined;
  return {
    i: state.id,
    c: state.compId,
    r: String(state.round ?? ''),
    d: state.date,
    p: state.venue,
    b: boards !== comp.boards ? boards : undefined,
    h: side(state.home),
    a: side(state.away),
    x: res.replace(/\.+$/, ''),
    f: state.referee?.name,
    o: state.referee?.role !== 'delegated' ? state.referee?.role : undefined,
    n: state.notes,
    l: logos,
  };
}

const rosterError = () =>
  Object.assign(
    new Error(
      'Soupisky na tomto zařízení a na zařízení s QR kódem se liší. Na obou obnov soupisky (↻ v hlavičce) a ukaž nový QR kód.',
    ),
    { code: 'roster' },
  );

function unpackSide(side, comp) {
  const team = Number.isInteger(side?.i) ? comp?.teams?.[side.i] : comp?.teams?.find((t) => t.name === side?.t);
  if (Number.isInteger(side?.i) && !team) throw rosterError();
  const refs = (side?.l ?? []).filter((e) => typeof e === 'number');
  if (refs.length && !team) throw rosterError();
  const lineup = (side?.l ?? []).map((e) => {
    if (typeof e === 'number') {
      const p = team.players.find((x) => x.no === e);
      if (!p) throw rosterError();
      return { no: p.no, name: p.name, types: [...(p.types ?? [])], rtg: p.rtg ?? null, fide: p.fide ?? null, nat: p.nat ?? null };
    }
    return { no: e.n, name: e.m ?? '', types: e.y ?? [], rtg: e.g ?? null, fide: e.f ?? null, nat: e.t ?? null, ...(e.u ? { manual: true } : {}) };
  });
  const fromRoster = lineup.filter((p, i) => typeof side.l[i] === 'number');
  if (fromRoster.length && checksum(fromRoster.map(playerKey).join(';')) !== side.s) throw rosterError();
  const captain = side?.k === 0 ? '' : side?.k ?? (team ? defaultCaptain(team) : '');
  return { team: team?.name ?? side?.t ?? '', captain, lineup };
}

function unpackShort(o, competitions) {
  const comp = competitions.find((c) => c.id === o.c);
  if (!comp) throw rosterError();
  const s = newMatch({ today: o.d });
  s.id = o.i;
  s.compId = o.c;
  s.round = o.r ?? '';
  s.date = o.d ?? s.date;
  s.venue = o.p ?? '';
  s.boards = o.b ?? comp.boards ?? null;
  s.home = unpackSide(o.h, comp);
  s.away = unpackSide(o.a, comp);
  s.referee = { name: o.f ?? '', role: o.o ?? 'delegated' };
  s.notes = o.n ?? '';
  if (o.l) s.logos = o.l;
  [...(o.x ?? '')].forEach((ch, i) => CHAR_RES[ch] && setBoardResult(s, i + 1, CHAR_RES[ch]));
  s.compInfo = { name: comp.name ?? '', short: comp.short ?? '', group: comp.group ?? '', season: comp.season ?? '', boards: comp.boards ?? null, teams: [], rounds: [] };
  return s;
}

// ---------- veřejné rozhraní ----------

/** Zápis bez podpisů, s údaji o soutěži, aby šel otevřít i tam, kde soutěž v datech není (úplný formát). */
export function linkPayload(state, { compInfo, boards } = {}) {
  return {
    ...state,
    boards: boards ?? state.boards ?? null,
    ...(compInfo ? { compInfo } : {}),
    sig: { home: '', ref: '', away: '' },
  };
}

/**
 * Odkaz se zápisem; base je adresa aplikace (bez #). Soutěž ze sdílených dat jde krátkým formátem,
 * jinak úplným.
 */
export async function encodeLink(state, { comp, boards, compInfo } = {}, base = '') {
  if (isShared(comp)) return pack(PREFIX2, packShort(state, comp, boards ?? comp.boards), base);
  return pack(PREFIX1, linkPayload(state, { compInfo, boards }), base);
}

/**
 * Zápis z části odkazu za „#“. competitions jsou soutěže, které má toto zařízení (pro krátký formát).
 * Vrací pročištěný zápis; jinak hodí chybu (u rozdílných soupisek s code 'roster').
 */
export async function decodeLink(hash, { competitions = [] } = {}) {
  if (!hasLink(hash)) throw new Error('Odkaz neobsahuje zápis.');
  const short = hash.startsWith(PREFIX2);
  const obj = await unpack(hash.slice((short ? PREFIX2 : PREFIX1).length));
  const m = cleanMatch(short ? unpackShort(obj, competitions) : obj);
  if (!m) throw new Error('Odkaz neobsahuje platný zápis.');
  return m;
}
