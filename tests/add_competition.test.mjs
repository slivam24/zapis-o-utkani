import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBoards, cleanShort, parseIssueBody, parseRegion, addEntry, Refused, MAX_COMPETITIONS, MIN_BOARDS, MAX_BOARDS } from '../scripts/add_competition.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BODY = `### Odkaz na turnaj

https://chess-results.com/tnr1507857.aspx?lan=5

### Počet šachovnic

8

### Zkratka soutěže (nepovinné)

KP II A

### Kraj

Ústecký kraj (ÚKŠS)

### Potvrzení

- [X] Jde o soutěž družstev (ne o turnaj jednotlivců) a odkaz vede na chess-results.com.
`;

const cfg = () => ({
  season: '2026/2027',
  competitions: [{ id: 'kp', short: 'KP', name: 'Krajský přebor', group: '', tnr: 1507857, boards: 8 }],
});
const info = (name = 'Extraliga', season = '2026/2027') => ({ name, season, teams: 12, players: 200 });

test('počet šachovnic: rozsah a nesmysly', () => {
  assert.equal(parseBoards('8'), 8);
  assert.equal(parseBoards(' 5 '), 5);
  for (const v of ['0', '1', '17', '99', 'hodně', '']) {
    assert.throws(() => parseBoards(v), Refused, v);
  }
});

test('zkratka: ořízne značky a délku', () => {
  assert.equal(cleanShort('KP II A'), 'KP II A');
  assert.equal(cleanShort('_No response_'), '');
  assert.equal(cleanShort(''), '');
  assert.equal(cleanShort('<script>x</script>'), 'scriptx/script');
  assert.ok(cleanShort('A'.repeat(100)).length <= 24);
});

test('čtení hlášení ze šablony', () => {
  const got = parseIssueBody(BODY);
  assert.equal(got.url, 'https://chess-results.com/tnr1507857.aspx?lan=5');
  assert.equal(got.boards, '8');
  assert.equal(got.short, 'KP II A');
  assert.equal(parseRegion(got.region), 'UKSS');
});

test('kraj: z výběru v hlášení, jinak z názvu', () => {
  assert.equal(parseRegion('Celostátní soutěž (ŠSČR)'), 'CR');
  assert.equal(parseRegion('Jihomoravský kraj (JmŠS)'), 'JmSS');
  assert.equal(parseRegion('_No response_', 'Krajský přebor ÚKŠS 2026/2027'), 'UKSS');
  assert.equal(parseRegion('', 'Turnaj bez kraje'), null);
});

test('jiné hlášení se ignoruje', () => {
  assert.throws(() => parseIssueBody('Ahoj, aplikace mi nejde na iPhonu.'), RangeError);
  assert.throws(() => parseIssueBody(''), RangeError);
});

test('přidání soutěže: jednotná zkratka a kraj', () => {
  const c = cfg();
  const entry = addEntry(c, 123456, 8, 'EXT', info(), 'CR');
  assert.equal(entry.id, 't123456');
  assert.equal(entry.short, 'Extraliga'); // u běžného názvu má přednost jednotná zkratka
  assert.equal(entry.region, 'CR');
  assert.equal(entry.season, '2026/2027');
  assert.equal(c.competitions.length, 2);
  // neobvyklý název: zadaná zkratka
  assert.equal(addEntry(cfg(), 777, 6, 'Pohár', info('Velikonoční pohár družstev')).short, 'Pohár');
});

test('bez zkratky se odvodí z názvu', () => {
  const c = cfg();
  const entry = addEntry(c, 222, 8, '', info('1. liga západ ŠSČR', null));
  assert.equal(entry.short, '1. liga západ');
  assert.equal(entry.season, undefined);
});

test('duplicitu odmítne a pojmenuje stávající', () => {
  assert.throws(() => addEntry(cfg(), 1507857, 8, '', info('Krajský přebor', null)), /KP/);
});

test('strop počtu soutěží', () => {
  const c = cfg();
  c.competitions = Array.from({ length: MAX_COMPETITIONS }, (_, i) => ({ id: `t${i}`, short: `${i}`, name: 'x', tnr: i, boards: 8 }));
  assert.throws(() => addEntry(c, 999999, 8, '', info('Nová', null)), Refused);
});

test('nastavení soutěží v repozitáři je v pořádku', () => {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'competitions.json'), 'utf8'));
  const ids = c.competitions.map((x) => x.id);
  const tnrs = c.competitions.map((x) => x.tnr);
  assert.equal(ids.length, new Set(ids).size, 'id soutěží se opakují');
  assert.equal(tnrs.length, new Set(tnrs).size, 'čísla turnajů se opakují');
  for (const x of c.competitions) {
    assert.ok(x.boards >= MIN_BOARDS && x.boards <= MAX_BOARDS, `${x.short}: počet šachovnic`);
    assert.ok(x.short && x.name, `${x.id}: chybí název`);
    assert.ok(x.region, `${x.id}: chybí kraj`);
  }
});

test('odebrání: vyhledání soutěže podle zkratky, id, čísla turnaje a odkazu', async () => {
  const { findCompetitions } = await import('../scripts/remove_competition.mjs');
  const list = [
    { id: 'kp', short: 'KP', name: 'Krajský přebor', tnr: 1507857, region: 'UKSS' },
    { id: 'kp2a', short: 'KP II A', name: 'Krajský přebor II. třídy', tnr: 1508693, region: 'UKSS' },
    { id: 't999', short: 'KP II A', name: 'Krajský přebor II. třídy', tnr: 999999, region: 'JmSS' },
  ];
  assert.deepEqual(findCompetitions(list, 'kp').map((c) => c.id), ['kp']);
  assert.deepEqual(findCompetitions(list, '1508693').map((c) => c.id), ['kp2a']);
  assert.deepEqual(findCompetitions(list, 'https://chess-results.com/tnr999999.aspx?lan=5').map((c) => c.id), ['t999']);
  assert.equal(findCompetitions(list, 'kp ii a').length, 2); // stejná zkratka ve dvou krajích: nic se nesmaže
  assert.equal(findCompetitions(list, 'neexistuje').length, 0);
  assert.equal(findCompetitions(list, '').length, 0);
});
