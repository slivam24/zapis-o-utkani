import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toDoc, parseRegionPage, parseLeagues, parseDetail, parseBoards, detectBoards, boardsUrl, parseAllRosters, parseSchedule, fetchCompetition, rostersUrl, scheduleUrl } from '../scripts/chesscz.mjs';
import { parseKraj, seasonYear, makeEntry, otherSeason } from '../scripts/import_chesscz.mjs';
import { readData, writeData, indexEntry } from '../scripts/data_store.mjs';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/chesscz/${f}`, import.meta.url), 'utf8');

test('chess.cz: soutěže kraje', () => {
  const list = parseRegionPage(toDoc(fixture('kraj.html')));
  assert.equal(list.length, 5);
  assert.deepEqual(list[0], { chesscz: 3459, name: 'Krajský přebor ÚKŠS' });
  assert.equal(list[4].name, "Krajský přebor III. třídy 'B'");
});

test('chess.cz: celostátní soutěže dospělých i mládeže', () => {
  const list = parseLeagues(toDoc(fixture('vyber-kraje.html')));
  assert.equal(list.length, 17);
  assert.equal(list[0].name, 'šachy.cz Extraliga');
  assert.ok(list.some((x) => x.name === "1. liga mládeže 'D'"));
});

test('chess.cz: detail soutěže a počet šachovnic', () => {
  const d = parseDetail(toDoc(fixture('soutez.html')));
  assert.equal(d.tnr, 1507857);
  assert.deepEqual(d.rounds, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(parseBoards(toDoc(fixture('sachovnice.html'))), 5); // KP III A: řádky v těle tabulky, součet je v patičce
  assert.equal(parseBoards(toDoc('<html><body><p>Kolo se ještě nehrálo.</p></body></html>')), 0);
});

test('chess.cz: počet šachovnic z prvního odehraného kola', async () => {
  const pages = { [boardsUrl(1, 1)]: '<p>nic</p>', [boardsUrl(1, 2)]: fixture('sachovnice.html') };
  assert.equal(await detectBoards(1, [1, 2, 3], { get: async (u) => pages[u] ?? '' }), 5);
  assert.equal(await detectBoards(1, [], { get: async () => '' }), 0);
});

test('import: kraj, ročník a záznam soutěže', () => {
  assert.equal(parseKraj('Ústecký kraj (ÚKŠS)'), 'UKSS');
  assert.equal(parseKraj('ÚKŠS'), 'UKSS');
  assert.equal(parseKraj('ukss'), 'UKSS');
  assert.equal(parseKraj('Celostátní soutěže (ŠSČR)'), 'CR');
  assert.equal(parseKraj('Celá republika'), 'vse');
  assert.equal(parseKraj('nesmysl'), null);
  assert.equal(seasonYear({ season: '2026/2027' }), 2026);
  // chess.cz občas odkazuje na loňský turnaj na chess-results
  assert.equal(otherSeason('Krajský přebor KHŠS 2024/2025', 2026), true);
  assert.equal(otherSeason('KHŠS - Krajský přebor družstev 2024/5', 2026), true);
  assert.equal(otherSeason('2. liga D 2026/27', 2026), false);
  assert.equal(otherSeason('Krajský přebor ÚKŠS 2026/2027', 2026), false);
  assert.equal(otherSeason('Krajský přebor 26/27', 2026), false);
  assert.equal(otherSeason('Krajský přebor', 2026), false);
  assert.equal(seasonYear({}, new Date('2027-03-01')), 2026);
  assert.equal(seasonYear({}, new Date('2027-09-01')), 2027);
  const e = makeEntry({ chesscz: 3460, name: "Krajský přebor II.třídy 'A'", tnr: 1508693, boards: 8, region: 'UKSS', season: '2026/2027' });
  assert.deepEqual(e, { id: 't1508693', short: 'KP II A', name: "Krajský přebor II.třídy 'A'", group: '', tnr: 1508693, boards: 8, region: 'UKSS', chesscz: 3460, season: '2026/2027' });
  const guess = makeEntry({ chesscz: 1, name: '2. liga \'A\'', tnr: 5, boards: 0, region: 'CR' });
  assert.equal(guess.boards, 8);
  assert.equal(guess.boardsUnverified, true);
});

test('rozdělená data: zápis, čtení, smazání odebrané soutěže', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapis-data-'));
  const comp = (id) => ({ id, short: id, name: id, tnr: 1, boards: 8, teams: [{ name: 'A', players: [] }], rounds: [{ no: 1, date: '2026-10-11' }, { no: 2, date: '2027-04-18' }] });
  let changed = await writeData(dir, { season: '2026/2027', comps: [comp('a'), comp('b')] });
  assert.ok(changed.includes('index.json') && changed.includes('comp/a.json'));
  assert.deepEqual(await writeData(dir, { season: '2026/2027', comps: [comp('a'), comp('b')] }), []); // beze změn
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  assert.deepEqual(idx.competitions[0], { id: 'a', short: 'a', name: 'a', tnr: 1, boards: 8, teamCount: 1, roundCount: 2, firstRound: '2026-10-11', lastRound: '2027-04-18' });
  changed = await writeData(dir, { season: '2026/2027', comps: [comp('a')] });
  assert.ok(changed.includes('comp/b.json (smazáno)'));
  const back = await readData(dir);
  assert.deepEqual([...back.comps.keys()], ['a']);
  assert.equal(back.comps.get('a').teams.length, 1);
  assert.deepEqual(indexEntry(comp('x')).teamCount, 1);
  fs.rmSync(dir, { recursive: true });
});

test('chess.cz: všechny soupisky soutěže (jména s diakritikou, národní Elo i FIDE)', () => {
  const teams = parseAllRosters(toDoc(fixture('soupisky.html')));
  assert.equal(teams.length, 3);
  assert.equal(teams[0].name, 'TJ Sokol Údlice "B"');
  assert.ok(teams[0].players.length >= 15);
  assert.deepEqual(teams[0].players[0], { no: 1, id: 34231, name: 'Horák Aleš', types: ['V'], rtg: null, nat: 2098, fide: 2120 });
  // kapitán je hráč s typem K, typ Z (registrace) se vynechá
  for (const t of teams) {
    const k = t.players.find((p) => p.types.includes('K'));
    assert.equal(t.captain, k?.name ?? '');
    assert.ok(t.players.every((p) => !p.types.includes('Z')));
  }
});

test('chess.cz: kompletní rozpis kol', () => {
  const rounds = parseSchedule(toDoc(fixture('rozpis.html')));
  assert.deepEqual(rounds.map((r) => [r.no, r.date, r.matches.length]), [[1, '2026-10-18', 6], [2, '2026-11-08', 6]]);
  assert.deepEqual(rounds[0].matches[0], { home: 'CHESS MOST "A"', away: 'TJ Sokol Údlice "B"' });
});

test('chess.cz: celá soutěž dvěma dotazy', async () => {
  const urls = [];
  const pages = { [rostersUrl(3459)]: fixture('soupisky.html'), [scheduleUrl(3459)]: fixture('rozpis.html') };
  const c = await fetchCompetition(3459, { get: async (u) => (urls.push(u), pages[u]) });
  assert.equal(urls.length, 2);
  assert.equal(c.teams.length, 3);
  assert.equal(c.rounds.length, 2);
});

test('import: soutěž jen na chess.cz dostane id podle chess.cz', () => {
  const e = makeEntry({ chesscz: 3458, name: 'Krajský přebor I.třídy', tnr: null, boards: 8, region: 'JmSS', season: '2026/2027' });
  assert.equal(e.id, 'c3458');
  assert.equal(e.tnr, undefined);
  assert.equal(e.short, 'KP');
});
