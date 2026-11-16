// Přenos zápisu odkazem (QR kódem) na jiné zařízení, typicky z notebooku na telefon k podpisu.
// Bez serveru: zápis je zkomprimovaný přímo v odkazu, v části za „#“, kterou prohlížeč na server neposílá.
import { cleanMatch } from './archive.js';

const PREFIX = '#z=1.';

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

/** Prázdné hodnoty se do odkazu nepíšou, QR kód je pak menší. Při načtení je doplní cleanMatch. */
const compact = (key, value) =>
  value === null || value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value;

/** Zápis bez podpisů, s údaji o soutěži, aby šel otevřít i tam, kde soutěž v datech není. */
export function linkPayload(state, { compInfo, boards } = {}) {
  return {
    ...state,
    boards: boards ?? state.boards ?? null,
    ...(compInfo ? { compInfo } : {}),
    sig: { home: '', ref: '', away: '' },
  };
}

export const hasLink = (hash) => typeof hash === 'string' && hash.startsWith(PREFIX);

/** Odkaz se zápisem: base je adresa aplikace (bez #). */
export async function encodeLink(payload, base) {
  const json = new TextEncoder().encode(JSON.stringify(payload, compact));
  const packed = await through(json, new CompressionStream('deflate-raw'));
  return `${base}${PREFIX}${toB64url(packed)}`;
}

/** Zápis z části odkazu za „#“. Vrací pročištěný zápis; když v odkazu nic platného není, hodí chybu. */
export async function decodeLink(hash) {
  if (!hasLink(hash)) throw new Error('Odkaz neobsahuje zápis.');
  let obj;
  try {
    const json = await through(fromB64url(hash.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    obj = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error('Odkaz se zápisem je poškozený. Naskenuj QR kód znovu.');
  }
  const m = cleanMatch(obj);
  if (!m) throw new Error('Odkaz neobsahuje platný zápis.');
  return m;
}
