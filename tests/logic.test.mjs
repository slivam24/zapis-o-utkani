import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTypes, maxRestricted, minPlayers, fmtPoints, fmtDate, autoResult, boardResult,
  setBoardResult, totals, newMatch, validate, hasErrors, matchBoards, restrictedCount, homeIsWhite, slug, defaultCaptain,
  ratingColumns, dominantRatingKey, ratingSummary,
} from '../js/logic.js';

const p = (no, types = [], name = `Hrac ${no}`) => ({ no, name, types, nat: 1800, fide: null });

function match(homeNos, awayNos, { homeTypes = {}, awayTypes = {} } = {}) {
  const s = newMatch({ today: '2026-11-02' });
  s.compId = 'kp';
  s.home.team = 'A';
  s.away.team = 'B';
  s.home.lineup = homeNos.map((n) => p(n, homeTypes[n] ?? []));
  s.away.lineup = awayNos.map((n) => p(n, awayTypes[n] ?? []));
  s.referee.name = 'Rozhodčí';
  s.home.captain = 'K1';
  s.away.captain = 'K2';
  s.venue = 'Herna';
  s.round = '1';
  return s;
}

test('typy hráčů: Z se vypouští', () => {
  assert.deepEqual(parseTypes('Z,ZK'), ['ZK']);
  assert.deepEqual(parseTypes('Z,H'), ['H']);
  assert.deepEqual(parseTypes('Z'), []);
  assert.deepEqual(parseTypes(''), []);
  assert.deepEqual(parseTypes('C'), ['C']);
  assert.deepEqual(parseTypes('Z,K'), ['K']);
});

test('limity podle čl. 3.6.2 a 3.6.3', () => {
  assert.equal(maxRestricted(8), 3);
  assert.equal(maxRestricted(5), 2);
  assert.equal(minPlayers(8), 4);
  assert.equal(minPlayers(5), 3);
});

test('H, V i C se počítají do limitu, K a ZK ne', () => {
  const l = [p(1, ['H']), p(2, ['V']), p(3, ['C']), p(4, ['K']), p(5, ['ZK']), p(6)];
  assert.equal(restrictedCount(l), 3);
});

test('formátování bodů a data', () => {
  assert.equal(fmtPoints(0), '0');
  assert.equal(fmtPoints(0.5), '½');
  assert.equal(fmtPoints(5.5), '5½');
  assert.equal(fmtPoints(8), '8');
  assert.equal(fmtDate('2026-11-02'), '2. 11. 2026');
});

test('barvy: domácí bílými na lichých šachovnicích', () => {
  assert.equal(homeIsWhite(1), true);
  assert.equal(homeIsWhite(2), false);
  assert.equal(homeIsWhite(7), true);
});

test('automatická kontumace neobsazených šachovnic', () => {
  assert.equal(autoResult(p(1), null), 'WK');
  assert.equal(autoResult(null, p(1)), 'LK');
  assert.equal(autoResult(null, null), 'XK');
  assert.equal(autoResult(p(1), p(1)), null);
});

test('součty: výsledky, kontumace a chybějící výsledky', () => {
  const s = match([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6]);
  // šachovnice 7 a 8: domácí hráč, host chybí -> 1K:0K
  assert.equal(boardResult(s, 7), 'WK');
  let t = totals(s, 8);
  assert.deepEqual(t.missing, [1, 2, 3, 4, 5, 6]);
  assert.equal(t.home, 2);
  setBoardResult(s, 1, 'W');
  setBoardResult(s, 2, 'D');
  setBoardResult(s, 3, 'L');
  setBoardResult(s, 4, 'D');
  setBoardResult(s, 5, 'W');
  setBoardResult(s, 6, 'D');
  t = totals(s, 8);
  assert.deepEqual(t.missing, []);
  assert.equal(t.home, 1 + 0.5 + 0 + 0.5 + 1 + 0.5 + 2);
  assert.equal(t.away, 0 + 0.5 + 1 + 0.5 + 0 + 0.5);
  assert.equal(fmtPoints(t.home), '5½');
});

test('výsledek se zruší, když se na šachovnici změní dvojice', () => {
  const s = match([1, 2], [1, 2]);
  setBoardResult(s, 1, 'W');
  assert.equal(boardResult(s, 1), 'W');
  s.home.lineup = [p(3), p(4)];
  assert.equal(boardResult(s, 1), null);
});

test('hráči se řadí podle pořadí na soupisce, ne podle výběru', () => {
  const s = match([5, 2, 9], [1]);
  setBoardResult(s, 1, 'W');
  // šachovnice 1 domácích je hráč č. 2
  assert.equal(s.results[1].h, 2);
});

test('limit hostů jen upozorní, nebrání vyplnění', () => {
  const s = match([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8], {
    homeTypes: { 1: ['H'], 2: ['V'], 3: ['C'], 4: ['H'] },
  });
  for (let b = 1; b <= 8; b++) setBoardResult(s, b, 'D');
  const issues = validate(s, { boards: 8 });
  const hit = issues.find((i) => /Domácí: hostů/.test(i.text));
  assert.ok(hit, 'upozornění musí být');
  assert.equal(hit.level, 'warn', 'je to upozornění, ne chyba');
  assert.equal(hasErrors(issues), false, 'jinak úplný zápis nesmí být kvůli limitu blokovaný');
});

test('kontrola: minimum hráčů v sestavě', () => {
  const s = match([1, 2, 3], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(validate(s, { boards: 8 }).some((i) => i.level === 'error' && /nejméně 4/.test(i.text)));
});

test('kontrola: 5 šachovnic, limit 2 a minimum 3', () => {
  const s = match([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], { awayTypes: { 1: ['H'], 2: ['H'], 3: ['V'] } });
  const issues = validate(s, { boards: 5 });
  assert.ok(issues.some((i) => /Hosté: hostů.*nejvýše 2/.test(i.text)));
  s.away.lineup = [p(1), p(2)];
  assert.ok(validate(s, { boards: 5 }).some((i) => /nejméně 3/.test(i.text)));
});

test('kompletní zápis bez chyb', () => {
  const s = match([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]);
  for (let b = 1; b <= 8; b++) setBoardResult(s, b, 'D');
  s.sig = { home: 'x', ref: 'x', away: 'x' };
  assert.deepEqual(validate(s, { boards: 8 }, { forFinal: true }), []);
});

test('výchozí kapitán: hráč typu K, jinak hlavička soupisky', () => {
  assert.equal(defaultCaptain({ captain: 'Jan Novák', players: [p(1, ['K'], 'Novak, Jan')] }), 'Novak, Jan');
  assert.equal(defaultCaptain({ captain: 'Michael Pospíchal', players: [p(1)] }), 'Michael Pospíchal');
  assert.equal(defaultCaptain(null), '');
});

test('slug odstraní diakritiku', () => {
  assert.equal(slug('Ústí nad Labem "B"'), 'Usti-nad-Labem-B');
});

test('kolonky s ratingem: jen ty, které jsou v datech', () => {
  const only = (obj) => ({ no: 1, name: 'X', types: [], rtg: null, fide: null, nat: null, ...obj });
  assert.deepEqual(ratingColumns([only({ rtg: 2003 })]).map((c) => c.short), ['Elo']);
  assert.deepEqual(ratingColumns([only({ nat: 1950 })]).map((c) => c.short), ['Nár.']);
  assert.deepEqual(ratingColumns([only({ fide: 1920 })]).map((c) => c.short), ['FIDE']);
  assert.deepEqual(ratingColumns([only({ fide: 1920, nat: 1950 })]).map((c) => c.short), ['FIDE', 'Nár.']);
  assert.deepEqual(ratingColumns([only({ rtg: 0 })]).map((c) => c.short), ['Elo'], 'bez ratingu zůstane jedna kolonka');
  assert.deepEqual(ratingColumns([]).map((c) => c.short), ['Elo']);
});

test('kolonky s ratingem: nula a null se nepočítají', () => {
  const players = [
    { no: 1, name: 'A', types: [], rtg: 1800, fide: 0, nat: null },
    { no: 2, name: 'B', types: [], rtg: 1750, fide: null, nat: null },
  ];
  assert.deepEqual(ratingColumns(players).map((c) => c.short), ['Elo'], 'FIDE 0 nevytvoří prázdnou kolonku');
  assert.equal(dominantRatingKey(players), 'rtg');
});

test('výpis ratingů hráče', () => {
  assert.equal(ratingSummary({ rtg: 2003, fide: null, nat: null }), '2003');
  assert.equal(ratingSummary({ rtg: null, fide: 1920, nat: 1950 }), 'FIDE 1920 · Nár. 1950');
  assert.equal(ratingSummary({ rtg: null, fide: null, nat: null }), '');
});

test('počet šachovnic: ze soutěže, ale zápis ho může přebít', () => {
  const s = match([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
  assert.equal(matchBoards(s, { boards: 8 }), 8, 'bez vlastní hodnoty platí soutěž');
  s.boards = 5;
  assert.equal(matchBoards(s, { boards: 8 }), 5, 'vlastní hodnota má přednost');
  s.boards = null;
  assert.equal(matchBoards(s, { boards: 5 }), 5);
  s.boards = 0;
  assert.equal(matchBoards(s, { boards: 8 }), 8, 'nesmysl se ignoruje');
  s.boards = 99;
  assert.equal(matchBoards(s, { boards: 8 }), 8);
  assert.equal(matchBoards({}, null), 8, 'bez soutěže se předpokládá 8');
});

test('kontrola počítá s přebitým počtem šachovnic', () => {
  const s = match([1, 2, 3], [1, 2, 3]);
  s.boards = 5;
  // 3 hráči jsou při 5 šachovnicích v pořádku (minimum je 3), při 8 ne
  assert.equal(validate(s, { boards: 8 }).some((i) => /nejméně/.test(i.text)), false);
  s.boards = null;
  assert.ok(validate(s, { boards: 8 }).some((i) => /nejméně 4/.test(i.text)));
});
