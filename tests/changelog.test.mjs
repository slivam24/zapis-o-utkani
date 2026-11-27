import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANGES, VERSION, fmtChangeDate, newerThan } from '../js/changelog.js';
import { aboutPage } from '../js/pages.js';

test('seznam změn: platná data od nejnovějšího, každý den má položky', () => {
  assert.ok(CHANGES.length > 0);
  for (const c of CHANGES) {
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(c.items.length > 0, c.date);
  }
  const dates = CHANGES.map((c) => c.date);
  assert.deepEqual(dates, [...new Set(dates)].sort().reverse());
  assert.equal(VERSION, dates[0]);
});

test('datum změny po česku', () => {
  assert.equal(fmtChangeDate('2026-11-02'), '2. 11. 2026');
});

test('novinky od naposledy viděné verze', () => {
  assert.equal(newerThan(VERSION).length, 0);
  assert.equal(newerThan('').length, CHANGES.length);
  assert.deepEqual(
    newerThan(CHANGES[1].date).map((c) => c.date),
    [CHANGES[0].date],
  );
});

test('O aplikaci: záložky a označení nových změn', () => {
  assert.match(aboutPage('navod'), /<h2>Návod<\/h2>/);
  assert.match(aboutPage('info'), /<h2>O aplikaci<\/h2>/);
  assert.match(aboutPage('neznama'), /<h2>Návod<\/h2>/);
  const changes = aboutPage('zmeny', { seen: CHANGES[1].date });
  assert.equal((changes.match(/badge new/g) ?? []).length, 1);
  assert.equal((aboutPage('zmeny').match(/badge new/g) ?? []).length, 0);
});

test('service worker ukládá seznam změn pro provoz bez internetu', () => {
  assert.match(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /'js\/changelog\.js'/);
});
