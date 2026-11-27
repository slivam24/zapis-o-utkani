import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { xlsToGrid } from '../scripts/xls.mjs';
import { readLok, applyLok } from '../scripts/lok.mjs';
import { toDoc, parseAllRosters } from '../scripts/chesscz.mjs';

// Výřez listiny LOK ve formátu .xls (BIFF8) se stejnými sloupci jako lok_sm_cz.xls z elo.miramal.com.
// Dlouhá jména na konci jsou výplň, aby tabulka textů přesáhla jeden záznam (záznamy CONTINUE).
const xls = () => fs.readFileSync(new URL('./fixtures/lok.xls', import.meta.url));
const lok = () => readLok(xls(), { min: 1 });

test('xls: buňky prvního listu, diakritika a text přes víc záznamů', () => {
  const grid = xlsToGrid(xls());
  assert.equal(grid.length, 66);
  assert.deepEqual(grid[0].slice(0, 9), ['ID_no', 'Name', 'ClubName', 'BirthDay', 'Sex', 'Rtg_nat', 'Rtg_int', 'Title', 'FIDE_no']);
  assert.deepEqual(grid[1].slice(0, 9), [2231, 'Drobný Zbyněk', 'Šachový klub Louny z.s.', '00.00.1970', '', 1813, 1827, '', 318230]);
  assert.equal(grid[6][1], `Hráč 001 ${'ŘŽČ'.repeat(30)}`);
  assert.equal(grid[65][1], `Hráč 060 ${'abc'.repeat(45)}`);
  assert.equal(grid[65][2], `Klub ${'Ústí '.repeat(20)}60`);
});

test('xls: jiný soubor než .xls se odmítne', () => {
  assert.throws(() => xlsToGrid(new Uint8Array(1024)), /není ve formátu .xls/);
  assert.throws(() => xlsToGrid(Buffer.from('ID_no;Name\n1;Novák Jan\n')), /není ve formátu .xls/);
});

test('LOK: hráči podle ID i FIDE ID, pojistka proti useknuté listině', () => {
  const l = lok();
  assert.equal(l.size, 65);
  assert.deepEqual(l.byId.get(34231), { id: 34231, name: 'Horák Aleš', nat: 2101, fide: 2133, fideId: 345678 });
  assert.equal(l.byFide.get(23767537).name, 'Kříž Denis');
  assert.equal(l.byId.get(5002).fideId, 0);
  assert.throws(() => readLok(xls()), /jen 65 hráčů/);
});

test('LOK: aktuální Elo podle ID z chess.cz, bez ratingu v LOK zůstává soupiska', () => {
  const teams = [
    {
      name: 'ŠK',
      captain: '',
      players: [
        { no: 1, id: 2231, name: 'Drobný Zbyněk', types: [], rtg: null, nat: 1790, fide: 1800 },
        { no: 2, id: 44344, name: 'Novák Jan', types: [], rtg: null, nat: 1650, fide: null },
        { no: 3, id: 777, name: 'Nikdo Neznámý', types: [], rtg: null, nat: 1500, fide: null },
        { no: 4, name: 'Bez Odkazu', types: [], rtg: null, nat: 1400, fide: null },
        { no: 5, id: 5002, name: 'Novakova Eva', types: [], rtg: null, nat: 1450, fide: 1520 },
      ],
    },
  ];
  const st = applyLok(teams, lok());
  const [a, b, c, d, e] = teams[0].players;
  assert.deepEqual([a.nat, a.fide], [1813, 1827]);
  assert.deepEqual([b.nat, b.fide], [1650, null], 'v LOK bez ratingu: zůstává Elo ze soupisky');
  assert.deepEqual([c.nat, d.nat], [1500, 1400], 'hráč mimo LOK a hráč bez ID se nemění');
  assert.deepEqual([e.name, e.nat, e.fide], ['Nováková Eva', 1500, 1520], 'FIDE v LOK chybí, zůstává ze soupisky');
  assert.deepEqual(st, { players: 5, matched: 3, rating: 2, name: 1 });
});

test('LOK: soupiska z chess-results podle FIDE ID, jméno s diakritikou a kapitán', () => {
  const teams = [
    {
      name: 'SK Děčín',
      captain: 'Kriz, Denis',
      players: [{ no: 1, fideId: 23767537, name: 'Kriz, Denis', types: ['K'], rtg: 2003, nat: null, fide: null }],
    },
  ];
  applyLok(teams, lok());
  assert.deepEqual(teams[0].players[0], { no: 1, fideId: 23767537, name: 'Kříž Denis', types: ['K'], rtg: null, nat: 1990, fide: 2011 });
  assert.equal(teams[0].captain, 'Kříž Denis');
});

test('LOK: jiné jméno u stejného ID se nepřepisuje', () => {
  const teams = [{ name: 'X', captain: '', players: [{ no: 1, id: 34231, name: 'Horáková Alena', types: [], rtg: null, nat: 2000, fide: null }] }];
  applyLok(teams, lok());
  assert.equal(teams[0].players[0].name, 'Horáková Alena');
  assert.equal(teams[0].players[0].nat, 2101);
});

test('LOK: soupisky z chess.cz nesou ID hráče a doplní se z listiny', () => {
  const html = fs.readFileSync(new URL('./fixtures/chesscz/soupisky.html', import.meta.url), 'utf8');
  const teams = parseAllRosters(toDoc(html));
  assert.ok(teams.flatMap((t) => t.players).every((p) => Number.isInteger(p.id) && p.id > 0));
  applyLok(teams, lok());
  assert.deepEqual(teams[0].players[0], { no: 1, id: 34231, name: 'Horák Aleš', types: ['V'], rtg: null, nat: 2101, fide: 2133 });
});
