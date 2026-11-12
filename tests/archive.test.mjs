import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, parseBackup, mergeArchive, olderThan, cleanMatch } from '../js/archive.js';
import { newMatch, setBoardResult, totals } from '../js/logic.js';

const m = (id, date, updatedAt = '2026-11-01T10:00:00Z') => {
  const s = newMatch({ today: date });
  return { ...s, id, updatedAt, home: { ...s.home, team: 'A' }, away: { ...s.away, team: 'B' } };
};

test('záloha: export a zpětné načtení', () => {
  const list = [m('z1', '2026-10-11'), m('z2', '2026-10-18')];
  const back = parseBackup(JSON.stringify(makeBackup(list)));
  assert.equal(back.length, 2);
  assert.equal(back[0].id, 'z1');
  assert.equal(back[1].home.team, 'A');
});

test('záloha: starší formát (holé pole) i jeden zápis', () => {
  assert.equal(parseBackup(JSON.stringify([m('z1', '2026-10-11')])).length, 1);
  assert.equal(parseBackup(JSON.stringify(m('z1', '2026-10-11'))).length, 1);
});

test('záloha: výsledky, sestavy a podpisy přežijí export a import', () => {
  const z = m('z1', '2026-10-11');
  const pl = (no) => ({ no, name: `H${no}`, types: [], rtg: 1800, fide: null, nat: null });
  z.home.lineup = [1, 2, 3, 4, 5].map(pl);
  z.away.lineup = [1, 2, 3, 4, 5].map(pl);
  z.boards = 5;
  ['W', 'D', 'L', 'WK', 'W'].forEach((c, i) => setBoardResult(z, i + 1, c));
  z.sig = { home: 'data:image/png;base64,AAAA', ref: '', away: '' };
  const back = parseBackup(JSON.stringify(makeBackup([z])))[0];
  assert.deepEqual(back.results, z.results);
  assert.deepEqual(totals(back, 5), totals(z, 5));
  assert.equal(back.home.lineup.length, 5);
  assert.equal(back.sig.home, 'data:image/png;base64,AAAA');
});

test('záloha: nesmysl se odmítne', () => {
  assert.throws(() => parseBackup('není json'), /neplatný formát/);
  assert.throws(() => parseBackup('{"a":1}'), /nejsou žádné zápisy/);
  assert.throws(() => parseBackup('[{"id":"x"}]'), /nejsou žádné zápisy/);
});

test('záloha: podpis smí být jen vložený obrázek', () => {
  const z = m('z1', '2026-10-11');
  z.sig = { home: 'data:image/png;base64,AAAA', ref: 'javascript:alert(1)', away: 'https://example.com/x.png' };
  const c = cleanMatch(z);
  assert.equal(c.sig.home, 'data:image/png;base64,AAAA');
  assert.equal(c.sig.ref, '');
  assert.equal(c.sig.away, '');
});

test('sloučení: nové se přidá, novější verze nahradí, starší se přeskočí', () => {
  const have = [m('z1', '2026-10-11', '2026-11-01T10:00:00Z'), m('z2', '2026-10-18', '2026-11-01T10:00:00Z')];
  const inc = [
    m('z1', '2026-10-11', '2026-11-05T10:00:00Z'), // novější
    m('z2', '2026-10-18', '2026-10-01T10:00:00Z'), // starší
    m('z3', '2026-11-01'), // nový
  ];
  const r = mergeArchive(have, inc);
  assert.deepEqual([r.added, r.updated, r.skipped], [1, 1, 1]);
  assert.deepEqual(r.list.map((x) => x.id), ['z3', 'z2', 'z1']); // od nejnovějšího utkání
  assert.equal(r.list.find((x) => x.id === 'z1').updatedAt, '2026-11-05T10:00:00Z');
});

test('staré zápisy podle lhůty', () => {
  const list = [m('a', '2025-09-01'), m('b', '2026-10-01')];
  const now = new Date('2026-11-12T12:00:00');
  assert.deepEqual(olderThan(list, 12, now).map((x) => x.id), ['a']);
  assert.deepEqual(olderThan(list, 0, now), []);
});

test('záloha: údaje o soutěži a počet šachovnic zůstanou', () => {
  const z = { ...m('z1', '2026-10-11'), boards: 5, compId: 'kp3a', compInfo: { name: 'Krajský přebor III. třídy', short: 'KP III A', group: 'A', season: '2026/2027', boards: 5, teams: [{ x: 1 }] } };
  const c = cleanMatch(z);
  assert.equal(c.boards, 5);
  assert.deepEqual(c.compInfo, { name: 'Krajský přebor III. třídy', short: 'KP III A', group: 'A', season: '2026/2027', boards: 5, teams: [], rounds: [] });
});
