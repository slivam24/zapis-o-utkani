import test from 'node:test';
import assert from 'node:assert/strict';
import { newTournament, newPlayer, renumber } from '../turnaj/js/model.js';
import { computeStandings, tiebreakData, tiebreakValue, directEncounter, ratingDifference } from '../turnaj/js/tiebreaks.js';

// Turnaj z kol zapsaných jako [[bílý, černý, výsledek], ...] a volen { hráč: typ }.
function build(n, rounds, games, { ratings } = {}) {
  const t = newTournament({ rounds });
  for (let i = 0; i < n; i++) t.players.push(newPlayer(t, { name: `Hráč ${i + 1}`, rating: ratings ? ratings[i] : 2000 - i }));
  renumber(t);
  t.roundsData = games.map(([pairs, byes = {}]) => ({
    pairs: pairs.map(([white, black, result]) => ({ white, black, result })),
    byes: Object.entries(byes).map(([player, type]) => ({ player: Number(player), type })),
  }));
  return t;
}

const tb = (t, code, id) => tiebreakValue(code, id, tiebreakData(t, t.roundsData.length), t);

test('Buchholz, Sonneborn-Berger a partie černými bez neodehraných kol', () => {
  // 4 hráči, 3 kola, každý s každým
  const t = build(4, 3, [
    [[[1, 2, '1-0'], [3, 4, '½-½']]],
    [[[4, 1, '0-1'], [2, 3, '1-0']]],
    [[[1, 3, '½-½'], [4, 2, '0-1']]],
  ]);
  // body: 1 = 2.5, 2 = 2, 3 = 1, 4 = 0.5
  assert.equal(tb(t, 'BH', 1), 2 + 0.5 + 1);
  assert.equal(tb(t, 'BH-C1', 1), 2 + 1);
  assert.equal(tb(t, 'SB', 1), 2 * 1 + 0.5 * 1 + 1 * 0.5);
  assert.equal(tb(t, 'BPG', 1), 1);
  assert.equal(tb(t, 'BPG', 2), 2);
  assert.equal(tb(t, 'WON', 2), 2);
  assert.equal(tb(t, 'PS', 1), 1 + 2 + 2.5);
  const st = computeStandings(t);
  assert.deepEqual(st.map((s) => s.player.id), [1, 2, 3, 4]);
});

test('čl. 16: volno na žádost v posledním kole se soupeřům počítá jako remíza', () => {
  // hráč 3 má v posledním kole půlbodové volno: pro soupeře má upravené skóre jako po remíze
  const t = build(4, 2, [
    [[[1, 3, '1-0'], [2, 4, '1-0']]],
    [[[1, 2, '0-1']], { 3: 'ZPB', 4: 'ZPB' }],
  ]);
  const data = tiebreakData(t, 2);
  assert.equal(data.score.get(3), 0);
  assert.equal(data.adjusted.get(3), 0.5); // ZPB v posledním kole = remíza (16.3.2)
  // Buchholz hráče 1: soupeř 3 (upraveno 0.5) + soupeř 2 (2 body)
  assert.equal(tb(t, 'BH', 1), 0.5 + 2);
  // vlastní neodehrané kolo hráče 3: fiktivní soupeř se skóre hráče, nejvýš remíza × počet kol
  assert.equal(tb(t, 'BH', 3), 1 + 0); // soupeř 1 má 1 bod, fiktivní soupeř min(0, 1) = 0
});

test('čl. 16.4: kontumační výhra – fiktivní soupeř nejvýš s upraveným skóre soupeře', () => {
  const t = build(4, 2, [
    [[[1, 2, '+-'], [3, 4, '1-0']]],
    [[[1, 3, '½-½'], [2, 4, '0-1']]],
  ]);
  // hráč 1: 1.5 b.; kontumace s hráčem 2 (0 b., kontumační prohra se počítá) → min(1.5, 0) = 0
  assert.equal(tb(t, 'BH', 1), 0 + 1.5);
  // SB: kontumační výhra 0 × 1, remíza s hráčem 3 (1.5 b.) × 0.5
  assert.equal(tb(t, 'SB', 1), 0.75);
});

test('čl. 16.5: Buchholz Cut-1 škrtá příspěvek z kola, které hráč nehrál dobrovolně', () => {
  const t = build(6, 3, [
    [[[1, 4, '1-0'], [2, 5, '1-0'], [3, 6, '1-0']]],
    [[[2, 3, '1-0'], [4, 6, '½-½']], { 1: 'HPB', 5: 'ZPB' }],
    [[[1, 2, '½-½'], [3, 5, '1-0'], [6, 4, '0-1']]],
  ]);
  // hráč 1: 2 b. (1 + ½ + ½); soupeři 4 (1.5 b.), volno (fiktivní min(2, 1.5) = 1.5), 2 (2.5 b.)
  assert.equal(tb(t, 'BH', 1), 1.5 + 1.5 + 2.5);
  // Cut-1 škrtá příspěvek z volna (VUR), ne nejnižší hodnotu soupeře 4 – obě jsou 1.5
  assert.equal(tb(t, 'BH-C1', 1), 1.5 + 2.5);
});

test('vzájemné partie: dva hráči, kteří spolu hráli', () => {
  const t = build(4, 3, [
    [[[1, 2, '0-1'], [3, 4, '1-0']]],
    [[[2, 3, '0-1'], [4, 1, '0-1']]],
    [[[1, 3, '1-0'], [4, 2, '0-1']]],
  ]);
  // 1: 2 b., 2: 2 b., 3: 2 b. – kruh, vzájemné partie nerozhodnou
  const data = tiebreakData(t, 3);
  assert.deepEqual(directEncounter([1, 2, 3], data, t), [[1, 2, 3]]);
  // dvojice 1 a 2: vyhrál 2
  assert.deepEqual(directEncounter([1, 2], data, t), [[2], [1]]);
});

test('vzájemné partie ve švýcarském systému (čl. 6.3): hráč sám na čele bez ohledu na chybějící partie', () => {
  const t = build(6, 3, [
    [[[1, 2, '1-0'], [3, 4, '1-0'], [5, 6, '1-0']]],
    [[[1, 3, '1-0'], [2, 5, '1-0'], [4, 6, '1-0']]],
    [[[5, 1, '0-1'], [6, 2, '0-1'], [4, 3, '0-1']]],
  ]);
  // skupina {1, 2, 3}: 1 porazil 2 i 3 → první; 2 a 3 spolu nehráli → zůstávají ve shodě
  const data = tiebreakData(t, 3);
  assert.deepEqual(directEncounter([1, 2, 3], data, t), [[1], [2, 3]]);
});

test('pořadí podle Soutěžního řádu: shoda bodů se rozhodne Buchholzem bez nejhoršího', () => {
  const t = build(4, 2, [
    [[[1, 3, '1-0'], [2, 4, '1-0']]],
    [[[1, 4, '0-1'], [2, 3, '0-1']]],
  ]);
  const st = computeStandings(t);
  assert.equal(st.length, 4);
  assert.ok(st.every((s) => s.score === 1));
});

test('převod úspěšnosti na rozdíl ratingu (FIDE)', () => {
  assert.equal(ratingDifference(1), 800);
  assert.equal(ratingDifference(0.5), 0);
  assert.equal(ratingDifference(0.75), 193);
  assert.equal(ratingDifference(0.25), -193);
  assert.equal(ratingDifference(0), -800);
});
