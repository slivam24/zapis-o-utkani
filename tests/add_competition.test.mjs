import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBoards, cleanShort, parseIssueBody, addEntry, Refused, MAX_COMPETITIONS, MIN_BOARDS, MAX_BOARDS } from '../scripts/add_competition.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BODY = `### Odkaz na turnaj

https://chess-results.com/tnr1507857.aspx?lan=5

### Počet šachovnic

8

### Zkratka soutěže (nepovinné)

KP II A

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
});

test('jiné hlášení se ignoruje', () => {
  assert.throws(() => parseIssueBody('Ahoj, aplikace mi nejde na iPhonu.'), RangeError);
  assert.throws(() => parseIssueBody(''), RangeError);
});

test('přidání soutěže', () => {
  const c = cfg();
  const entry = addEntry(c, 123456, 8, 'EXT', info());
  assert.equal(entry.id, 't123456');
  assert.equal(entry.short, 'EXT');
  assert.equal(entry.season, '2026/2027');
  assert.equal(c.competitions.length, 2);
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
  }
});
