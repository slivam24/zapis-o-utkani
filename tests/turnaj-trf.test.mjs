import test from 'node:test';
import assert from 'node:assert/strict';
import { newTournament, newPlayer, renumber, pairNextRound, roundRecord } from '../turnaj/js/model.js';
import { tournamentToTRF, trfToTournament, parseTRF } from '../turnaj/js/trf.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// náhodný turnaj s kontumacemi a volny
function simulate(n, rounds, seed) {
  const r = rng(seed);
  const t = newTournament({ name: 'Test', rounds });
  for (let i = 0; i < n; i++) t.players.push(newPlayer(t, { name: `Hráč ${i + 1}`, rating: 1400 + Math.floor(r() * 900) }));
  renumber(t);
  for (let k = 1; k <= rounds; k++) {
    if (k > 1 && r() < 0.6) (t.requests[k] ||= {})[t.players[Math.floor(r() * n)].id] = r() < 0.5 ? 'HPB' : 'ZPB';
    pairNextRound(t, { random: r });
    for (const g of t.roundsData[k - 1].pairs) {
      const x = r();
      g.result = x < 0.04 ? '+-' : x < 0.07 ? '-+' : x < 0.4 ? '1-0' : x < 0.7 ? '½-½' : '0-1';
    }
  }
  return t;
}

test('TRF: uložení a načtení zachová hráče i výsledky', () => {
  const t = simulate(17, 6, 42);
  const text = tournamentToTRF(t);
  const back = trfToTournament(text);
  assert.equal(back.players.length, t.players.length);
  assert.equal(back.roundsData.length, t.roundsData.length);
  assert.equal(back.initialColour, t.initialColour);
  const tpn = new Map(t.players.map((p) => [p.id, p.tpn]));
  for (const p of t.players) {
    for (let r = 1; r <= t.roundsData.length; r++) {
      const a = roundRecord(t, p.id, r);
      const b = roundRecord(back, tpn.get(p.id), r);
      const kindA = a.kind === 'absent' ? 'ZPB' : a.kind;
      const kindB = b.kind === 'absent' ? 'ZPB' : b.kind;
      assert.equal(kindB, kindA, `hráč ${p.tpn}, kolo ${r}`);
      assert.equal(b.points, a.points);
      if (a.opp) assert.equal(b.opp, tpn.get(a.opp));
      if (a.kind === 'game') assert.equal(b.colour, a.colour);
    }
  }
});

test('TRF: řádek 001 má pevné sloupce', () => {
  const t = simulate(5, 2, 7);
  const line = tournamentToTRF(t).split('\n').find((l) => l.startsWith('001'));
  assert.equal(line.slice(4, 8), '   1');
  assert.equal(line.slice(14, 19), 'Hráč ');
  assert.match(line.slice(80, 84), /^ *\d+\.\d$/);
  assert.equal(parseTRF(tournamentToTRF(t)).players[0].results.length, 2);
});

test('TRF: po načtení jde vylosovat další kolo stejně jako v původním turnaji', () => {
  const t = simulate(14, 7, 99);
  const lastPairs = t.roundsData.pop();
  const back = trfToTournament(tournamentToTRF(t));
  const tpn = new Map(t.players.map((p) => [p.id, p.tpn]));
  back.requests = Object.fromEntries(Object.entries(t.requests).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([id, ty]) => [tpn.get(Number(id)), ty]))]));
  pairNextRound(back);
  const got = back.roundsData[back.roundsData.length - 1].pairs.map((g) => `${g.white}-${g.black}`).sort();
  const exp = lastPairs.pairs.map((g) => `${tpn.get(g.white)}-${tpn.get(g.black)}`).sort();
  assert.deepEqual(got, exp);
});
