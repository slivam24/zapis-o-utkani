import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, standardShort, regionFromText, isFinished, groupCompetitions, compareComps } from '../js/catalog.js';

const c = (name, extra = {}) => ({ id: name, name, ...extra });

test('zkratky podle názvu soutěže', () => {
  const cases = [
    ['šachy.cz Extraliga', 'Extraliga'],
    ['1. liga - východ', '1. liga východ'],
    ['1. liga - západ', '1. liga západ'],
    ["2. liga 'A'", '2. liga A'],
    ["2. liga 'F'", '2. liga F'],
    ['Krajský přebor ÚKŠS', 'KP'],
    ["Krajský přebor II.třídy 'A'", 'KP II A'],
    ["Krajský přebor III. třídy 'B'", 'KP III B'],
    ['Extraliga mládeže – skupina východ', 'Extraliga ml. východ'],
    ['MČR družstev mládeže - finále A', 'Finále ml. A'],
    ["1. liga mládeže 'C'", '1. liga ml. C'],
    // nižší soutěže z krajů (názvy z chess.cz)
    ['Krajský přebor I.třídy', 'KP'],
    ['Krajský přebor II', 'KP II'],
    ['Krajský přebor I', 'KP'],
    ['Krajský přebor II východ', 'KP II východ'],
    ['1. jihočeská divize', '1. divize'],
    ['2. divize - zákl. skupina A', '2. divize A'],
    ['Krajská soutěž - západ', 'KS západ'],
    ['Krajská soutěž „A“', 'KS A'],
    ['Krajská soutěž jih', 'KS jih'],
    ['Krajská soutěž I. - východ', 'KS I východ'],
    ['Zlínská krajská soutěž - západ', 'KS západ'],
    ['Oblastní přebor - sever', 'OblP sever'],
    ['Regionální přebor - B', 'RP B'],
    ["Regionální soutěž 'D'", 'RS D'],
    ['Regionální přebor - Kroměříž', 'RP Kroměříž'],
    ['Regionální soutěž - Uherské Hradiště', 'RS Uherské Hradiště'],
    ['Okresní přebor Karviná - základní část', 'OP Karviná'],
    ['Přebor okresu Šumperk', 'OP Šumperk'],
    ['Městský přebor Ostrava', 'MP Ostrava'],
    ['Okresní soutěž Opava', 'OS Opava'],
    ['Krajský přebor družstev starších žáků', 'KP ml.'],
    ['Krajský přebor žákovských družstev', 'KP ml.'],
  ];
  for (const [name, short] of cases) assert.equal(standardShort(c(name)), short, name);
  // skupina z pole group má přednost
  assert.equal(standardShort(c('Krajský přebor II. třídy', { group: 'B' })), 'KP II B');
});

test('úroveň: extraliga nad ligami nad krajskými přebory, mládež zvlášť', () => {
  assert.equal(tierOf(c('šachy.cz Extraliga')).rank, 0);
  assert.equal(tierOf(c("2. liga 'B'")).rank, 2);
  assert.equal(tierOf(c("Krajský přebor III. třídy 'A'")).rank, 12);
  assert.equal(tierOf(c("1. liga mládeže 'A'")).youth, true);
  assert.equal(tierOf(c('Krajský přebor ÚKŠS')).youth, false);
  assert.equal(tierOf(c('2. divize - zákl. skupina A')).youth, false); // „zákl.“ není „žáci“
  // pořadí v kraji: KP, KP II, KS, oblastní a regionální, okresní a městské
  const order = ['Okresní soutěž Opava', 'Městský přebor Ostrava', 'Regionální přebor - B', 'Krajská soutěž „A“', "Krajský přebor II.třídy 'A'", 'Krajský přebor I.třídy'];
  assert.deepEqual(order.map((n) => c(n)).sort(compareComps).map((x) => standardShort(x)), ['KP', 'KP II A', 'KS A', 'RP B', 'MP Ostrava', 'OS Opava']);
});

test('kraj z názvu', () => {
  assert.equal(regionFromText('Krajský přebor ÚKŠS 2026/2027'), 'UKSS');
  assert.equal(regionFromText('2026/2027 - Ústecký krajský šachový svaz (ÚKŠS)'), 'UKSS');
  assert.equal(regionFromText('KP JmŠS'), 'JmSS');
  assert.equal(regionFromText('Krajský přebor Moravskoslezského kraje'), 'MKSS');
  assert.equal(regionFromText("2. liga 'A'"), null);
});

test('ukončená soutěž: poslední kolo před víc než 30 dny', () => {
  const now = new Date('2027-05-20T12:00:00');
  assert.equal(isFinished({ rounds: [{ date: '2027-04-18' }, { date: '2027-03-01' }] }, { now }), true);
  assert.equal(isFinished({ rounds: [{ date: '2027-04-30' }] }, { now }), false);
  assert.equal(isFinished({ rounds: [] }, { now }), false);
});

test('nabídka: skupiny a pořadí', () => {
  const now = new Date('2026-11-20T12:00:00');
  const live = [{ date: '2027-04-01' }];
  const comps = [
    c("Krajský přebor III. třídy 'B'", { region: 'UKSS', rounds: live }),
    c('Krajský přebor ÚKŠS', { region: 'UKSS', rounds: live }),
    c("Krajský přebor II.třídy 'A'", { region: 'UKSS', rounds: live }),
    c("2. liga 'B'", { region: 'CR', rounds: live }),
    c('šachy.cz Extraliga', { region: 'CR', rounds: live }),
    c("1. liga mládeže 'A'", { region: 'CR', rounds: live }),
    c('Krajský přebor JmŠS', { region: 'JmSS', rounds: live }),
    c('Stará soutěž', { region: 'UKSS', rounds: [{ date: '2026-04-01' }] }),
    c('Moje soutěž', { local: true }),
  ];
  const all = groupCompetitions(comps, { now });
  assert.deepEqual(all.map((g) => g.label), [
    'Celostátní soutěže',
    'Celostátní soutěže mládeže',
    'Jihomoravský kraj (JmŠS)',
    'Ústecký kraj (ÚKŠS)',
    'Vlastní soutěže (jen v tomto zařízení)',
    'Ukončené soutěže',
  ]);
  assert.deepEqual(all[0].comps.map((x) => x.name), ['šachy.cz Extraliga', "2. liga 'B'"]);
  assert.deepEqual(all[3].comps.map((x) => standardShort(x)), ['KP', 'KP II A', 'KP III B']);
  // můj kraj: jen celostátní a ten kraj, kraj hned za celostátními
  const mine = groupCompetitions(comps, { now, region: 'UKSS' });
  assert.deepEqual(mine.map((g) => g.label), [
    'Celostátní soutěže',
    'Celostátní soutěže mládeže',
    'Ústecký kraj (ÚKŠS)',
    'Vlastní soutěže (jen v tomto zařízení)',
    'Ukončené soutěže',
  ]);
  // vybraná soutěž z jiného kraje zůstane vidět
  const keep = groupCompetitions(comps, { now, region: 'UKSS', keep: 'Krajský přebor JmŠS' });
  assert.ok(keep.some((g) => g.label.startsWith('Jihomoravský')));
});

test('řazení: dospělí před mládeží, skupiny abecedně', () => {
  const list = [c("1. liga mládeže 'A'"), c("2. liga 'C'"), c("2. liga 'A'"), c('1. liga - západ'), c('1. liga - východ')].sort(compareComps);
  assert.deepEqual(list.map((x) => standardShort(x)), ['1. liga východ', '1. liga západ', '2. liga A', '2. liga C', '1. liga ml. A']);
});
