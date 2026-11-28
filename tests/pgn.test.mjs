import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pgnText, whiteResult, pgnGames, buildPgn } from '../js/pgn.js';
import { newMatch, setBoardResult } from '../js/logic.js';

const player = (no, name, extra = {}) => ({ no, name, types: [], rtg: null, fide: null, nat: null, ...extra });

function match() {
  const s = newMatch({ today: '2026-11-29' });
  s.round = '4';
  s.venue = 'Obecní dům Líně, Hornická 848';
  s.boards = 4;
  s.home = {
    team: 'TJ Sokol Údlice "B"',
    captain: '',
    lineup: [player(1, 'Řehoř Šimon', { fide: 2100 }), player(2, "O'Neill Łukasz", { rtg: 1950 }), player(3, 'Nováková Žofie'), player(4, 'Dvořák Jiří')],
  };
  s.away = {
    team: 'ŠK „Dvorec“',
    captain: '',
    lineup: [player(1, 'Černý Petr', { fide: 2050, nat: 2080 }), player(2, 'Bílý Ondřej'), player(5, 'Malá Eva')],
  };
  return s;
}
const comp = { name: "2. liga 'A'", short: '2. liga A', boards: 4 };

test('PGN text: bez diakritiky a bez uvozovek', () => {
  assert.equal(pgnText('TJ Sokol Údlice "B"'), 'TJ Sokol Udlice B');
  assert.equal(pgnText('ŠK „Dvorec“'), 'SK Dvorec');
  assert.equal(pgnText("2. liga 'A'"), '2. liga A');
  assert.equal(pgnText("O'Neill Łukasz"), 'ONeill Lukasz');
  assert.equal(pgnText('Příliš žluťoučký kůň úpěl ďábelské ódy'), 'Prilis zlutoucky kun upel dabelske ody');
  assert.equal(pgnText('ŠK DP Praha B – EA Hotels'), 'SK DP Praha B - EA Hotels');
  assert.equal(pgnText('  a\\b [c] '), 'ab c');
});

test('PGN výsledek z pohledu bílého: domácí bílí na lichých, černí na sudých šachovnicích', () => {
  // 1 : 0 = vyhráli domácí
  assert.equal(whiteResult('W', 1), '1-0');
  assert.equal(whiteResult('W', 2), '0-1');
  assert.equal(whiteResult('L', 1), '0-1');
  assert.equal(whiteResult('L', 2), '1-0');
  assert.equal(whiteResult('D', 2), '1/2-1/2');
  assert.equal(whiteResult(null, 3), '*');
});

test('PGN: barvy se střídají, domácí na 1. šachovnici bílými, na 2. černými', () => {
  const s = match();
  setBoardResult(s, 1, 'W'); // domácí vyhráli bílými
  setBoardResult(s, 2, 'W'); // domácí vyhráli černými
  setBoardResult(s, 3, 'D');
  const { games, skipped } = pgnGames(s, comp);
  assert.deepEqual(
    games.map((g) => [g.board, g.white.name, g.black.name, g.result]),
    [
      [1, 'Řehoř Šimon', 'Černý Petr', '1-0'],
      [2, 'Bílý Ondřej', "O'Neill Łukasz", '0-1'],
      [3, 'Nováková Žofie', 'Malá Eva', '1/2-1/2'],
    ],
  );
  // 4. šachovnice: hosté nemají hráče, kontumace 1K : 0K se nehrála
  assert.deepEqual(skipped, [4]);
});

test('PGN: kontumace zadaná ručně se vynechá, chybějící výsledek je *', () => {
  const s = match();
  setBoardResult(s, 1, 'WK');
  const { games, skipped } = pgnGames(s, comp);
  assert.deepEqual(skipped, [1, 4]);
  assert.deepEqual(games.map((g) => g.result), ['*', '*']);
});

test('PGN: celý soubor', () => {
  const s = match();
  setBoardResult(s, 1, 'W');
  setBoardResult(s, 2, 'L');
  setBoardResult(s, 3, 'D');
  const pgn = buildPgn(s, comp);
  assert.equal(
    pgn.split('\n\n[')[1].replace(/^/, '['),
    [
      '[Event "2. liga A"]',
      '[Site "Obecni dum Line, Hornicka 848"]',
      '[Date "2026.11.29"]',
      '[Round "4.2"]',
      '[White "Bily Ondrej"]',
      '[Black "ONeill Lukasz"]',
      '[Result "1-0"]',
      '[WhiteTeam "SK Dvorec"]',
      '[BlackTeam "TJ Sokol Udlice B"]',
      '[BlackElo "1950"]',
      '[Board "2"]',
      '',
      '1-0',
    ].join('\n'),
  );
  assert.match(pgn, /\[White "Rehor Simon"\]\n\[Black "Cerny Petr"\]\n\[Result "1-0"\]/);
  assert.match(pgn, /\[WhiteElo "2100"\]\n\[BlackElo "2050"\]/); // Elo FIDE, ne národní
  assert.equal((pgn.match(/\[Event /g) ?? []).length, 3);
  // jen ASCII, žádné uvozovky uvnitř hodnot
  assert.ok(/^[\x0a\x20-\x7e]*$/.test(pgn));
  for (const line of pgn.split('\n').filter((l) => l.startsWith('['))) assert.match(line, /^\[\w+ "[^"]*"\]$/);
});
