import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeLink, decodeLink, hasLink, linkPayload } from '../js/link.js';
import { newMatch, setBoardResult, totals } from '../js/logic.js';
import qrcode from '../js/vendor/qrcode.js';

const BASE = 'https://slivam24.github.io/zapis-o-utkani/';

/** Skutečné utkání ze soupisek: 8 šachovnic, výsledky, rozhodčí, záznam. */
function realMatch() {
  const data = JSON.parse(fs.readFileSync(new URL('../data/competitions.json', import.meta.url)));
  const comp = data.competitions.find((c) => c.boards === 8 && c.teams.length >= 2);
  const s = newMatch({ today: '2026-11-15' });
  s.compId = comp.id;
  s.round = '3';
  s.venue = 'DDM, Velká Hradební 19, Ústí nad Labem';
  for (const [side, t] of [['home', comp.teams[0]], ['away', comp.teams[1]]]) {
    s[side].team = t.name;
    s[side].captain = t.players.find((p) => p.types.includes('K'))?.name ?? t.players[0].name;
    s[side].lineup = t.players.slice(0, 8).map((p) => ({ ...p, types: [...p.types] }));
  }
  ['W', 'D', 'L', 'W', 'D', 'D', 'L', 'W'].forEach((c, i) => setBoardResult(s, i + 1, c));
  s.referee = { name: 'Řeháček Jan', role: 'player' };
  s.notes = 'Utkání proběhlo bez připomínek. Hodiny nastavila a obsluhovala osoba zajištěná pořadatelem (čl. 2.5.3).';
  s.sig = { home: 'data:image/png;base64,AAAA', ref: '', away: '' };
  return { s, comp };
}

test('odkaz se zápisem: tam a zpět beze ztráty (kromě podpisů)', async () => {
  const { s, comp } = realMatch();
  const compInfo = { name: comp.name, short: comp.short, group: comp.group, season: comp.season, boards: 8, teams: [], rounds: [] };
  const url = await encodeLink(linkPayload(s, { compInfo, boards: 8 }), BASE);
  assert.ok(url.startsWith(`${BASE}#z=1.`));
  const back = await decodeLink(url.slice(BASE.length));
  assert.equal(back.id, s.id);
  assert.equal(back.home.team, s.home.team);
  assert.deepEqual(back.home.lineup.map((p) => [p.no, p.name, p.rtg]), s.home.lineup.map((p) => [p.no, p.name, p.rtg]));
  assert.deepEqual(back.results, s.results);
  assert.deepEqual(totals(back, 8), totals(s, 8));
  assert.equal(back.notes, s.notes);
  assert.equal(back.venue, s.venue);
  assert.deepEqual(back.referee, s.referee);
  assert.equal(back.compInfo.name, comp.name);
  assert.equal(back.boards, 8);
  // podpisy se nepřenášejí, podepisuje se až na telefonu
  assert.deepEqual(back.sig, { home: '', ref: '', away: '' });
});

test('odkaz se vejde do QR kódu, který jde z obrazovky načíst', async () => {
  const { s, comp } = realMatch();
  const url = await encodeLink(linkPayload(s, { compInfo: { name: comp.name, short: comp.short, boards: 8 }, boards: 8 }), BASE);
  const q = qrcode(0, 'M');
  q.addData(url, 'Byte');
  q.make();
  const version = (q.getModuleCount() - 17) / 4;
  console.log(`  délka odkazu ${url.length} znaků, QR verze ${version} (${q.getModuleCount()} modulů)`);
  assert.ok(url.length < 1500, 'odkaz je krátký');
  assert.ok(version <= 30, 'QR kód není příliš hustý');
});

test('poškozený nebo cizí odkaz se odmítne', async () => {
  assert.equal(hasLink('#neco'), false);
  await assert.rejects(decodeLink('#z=1.!!!nesmysl'), /poškozený/);
  await assert.rejects(decodeLink('#jiny'), /neobsahuje zápis/);
});
