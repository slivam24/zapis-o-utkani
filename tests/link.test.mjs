import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeLink, decodeLink, hasLink, linkPayload } from '../js/link.js';
import { newMatch, setBoardResult, totals } from '../js/logic.js';
import qrcode from '../js/vendor/qrcode.js';

const BASE = 'https://slivam24.github.io/zapis-o-utkani/';
// sdílená data: seznam a soubor pro každou soutěž (viz scripts/data_store.mjs)
const read = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url)));
const DATA = { competitions: read('index.json').competitions.map((c) => read(`comp/${c.id}.json`)) };
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Skutečné utkání ze soupisek: 8 šachovnic, výsledky, rozhodčí, záznam, podpisy. */
function realMatch() {
  const comp = DATA.competitions.find((c) => c.boards === 8 && c.teams.length >= 2);
  const s = newMatch({ today: '2026-11-15' });
  s.compId = comp.id;
  s.round = '3';
  s.venue = 'DDM, Velká Hradební 19, Ústí nad Labem';
  for (const [side, t] of [['home', comp.teams[0]], ['away', comp.teams[1]]]) {
    s[side].team = t.name;
    s[side].captain = t.players.find((p) => p.types.includes('K'))?.name ?? t.players[0].name;
    s[side].lineup = t.players.slice(0, 8).map((p) => ({ ...p, types: [...p.types] }));
  }
  ['W', 'D', 'L', 'WK', 'D', 'XK', 'L', 'LK'].forEach((c, i) => setBoardResult(s, i + 1, c));
  s.referee = { name: 'Řeháček Jan', role: 'player' };
  s.notes = 'Utkání proběhlo bez připomínek.';
  s.sig = { home: 'data:image/png;base64,AAAA', ref: 'data:image/png;base64,AAAA', away: '' };
  return { s, comp };
}

const qrVersion = (url) => {
  const q = qrcode(0, 'L');
  q.addData(url, 'Byte');
  q.make();
  return (q.getModuleCount() - 17) / 4;
};

test('krátký odkaz: tam a zpět beze ztráty, bez podpisů', async () => {
  const { s, comp } = realMatch();
  const url = await encodeLink(s, { comp, boards: 8 }, BASE);
  assert.ok(url.startsWith(`${BASE}#z=2.`));
  const back = await decodeLink(url.slice(BASE.length), { competitions: DATA.competitions });
  assert.equal(back.id, s.id);
  assert.equal(back.compId, s.compId);
  assert.equal(back.round, '3');
  assert.equal(back.date, s.date);
  assert.equal(back.venue, s.venue);
  for (const side of ['home', 'away']) {
    assert.equal(back[side].team, s[side].team);
    assert.equal(back[side].captain, s[side].captain);
    assert.deepEqual(back[side].lineup.map((p) => [p.no, p.name, p.rtg, p.types.join()]), s[side].lineup.map((p) => [p.no, p.name, p.rtg, p.types.join()]));
  }
  assert.deepEqual(back.results, s.results);
  assert.deepEqual(totals(back, 8), totals(s, 8));
  assert.deepEqual(back.referee, s.referee);
  assert.equal(back.notes, s.notes);
  assert.deepEqual(back.sig, { home: '', ref: '', away: '' });
  assert.equal(back.compInfo.name, comp.name);
});

test('krátký odkaz je výrazně menší než úplný', async () => {
  const { s, comp } = realMatch();
  const short = await encodeLink(s, { comp, boards: 8 }, BASE);
  const full = await encodeLink(s, { compInfo: { name: comp.name, boards: 8 }, boards: 8 }, BASE);
  console.log(`  krátký ${short.length} znaků (QR verze ${qrVersion(short)}), úplný ${full.length} znaků (QR verze ${qrVersion(full)})`);
  assert.ok(short.length < full.length / 2);
  assert.ok(qrVersion(short) <= 12);
});

test('hráč mimo soupisku a upravený hráč jdou celí', async () => {
  const { s, comp } = realMatch();
  s.home.lineup[7] = { no: 99, name: 'Nový, Hráč', types: ['H'], rtg: 1500, fide: null, nat: null, manual: true };
  s.away.lineup[0] = { ...s.away.lineup[0], name: 'Opravené, Jméno', rtg: 2001 };
  const back = await decodeLink((await encodeLink(s, { comp, boards: 8 }, BASE)).slice(BASE.length), { competitions: DATA.competitions });
  assert.deepEqual([back.home.lineup[7].no, back.home.lineup[7].name, back.home.lineup[7].manual], [99, 'Nový, Hráč', true]);
  assert.deepEqual([back.away.lineup[0].name, back.away.lineup[0].rtg], ['Opravené, Jméno', 2001]);
});

test('rozdílné soupisky na telefonu se poznají', async () => {
  const { s, comp } = realMatch();
  const hash = (await encodeLink(s, { comp, boards: 8 }, BASE)).slice(BASE.length);
  const other = clone(DATA.competitions);
  const t = other.find((c) => c.id === comp.id).teams.find((x) => x.name === s.home.team);
  t.players[2].rtg = (t.players[2].rtg ?? 0) + 7; // jiná verze soupisky
  await assert.rejects(decodeLink(hash, { competitions: other }), (e) => e.code === 'roster');
  await assert.rejects(decodeLink(hash, { competitions: [] }), (e) => e.code === 'roster');
});

test('vlastní soutěž (jen v zařízení) jde úplným odkazem i bez dat', async () => {
  const { s, comp } = realMatch();
  const local = { ...comp, local: true };
  const url = await encodeLink(s, { comp: local, boards: 8, compInfo: { name: 'Vlastní soutěž', boards: 8 } }, BASE);
  assert.ok(url.startsWith(`${BASE}#z=1.`));
  const back = await decodeLink(url.slice(BASE.length));
  assert.equal(back.compInfo.name, 'Vlastní soutěž');
  assert.deepEqual(back.results, s.results);
  assert.deepEqual(back.sig, { home: '', ref: '', away: '' });
});

test('starší úplný odkaz (verze 1) jde pořád načíst', async () => {
  const { s } = realMatch();
  const json = new TextEncoder().encode(JSON.stringify(linkPayload(s, { boards: 8 })));
  const packed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const b64 = btoa(String.fromCharCode(...packed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const back = await decodeLink(`#z=1.${b64}`);
  assert.equal(back.home.team, s.home.team);
});

test('poškozený nebo cizí odkaz se odmítne', async () => {
  assert.equal(hasLink('#neco'), false);
  await assert.rejects(decodeLink('#z=2.!!!nesmysl'), /poškozený/);
  await assert.rejects(decodeLink('#jiny'), /neobsahuje zápis/);
});

test('krátký odkaz: prázdný a jiný kapitán zůstanou, jak byli', async () => {
  const { s, comp } = realMatch();
  s.home.captain = '';
  s.away.captain = 'Někdo, Jiný';
  const back = await decodeLink((await encodeLink(s, { comp, boards: 8 }, BASE)).slice(BASE.length), { competitions: DATA.competitions });
  assert.equal(back.home.captain, '');
  assert.equal(back.away.captain, 'Někdo, Jiný');
});
