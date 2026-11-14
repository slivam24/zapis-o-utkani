import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import {
  parseIndividualRound,
  parseTeamRound,
  parseRoundHeading,
  parseTournamentInput,
  isTeamTournament,
  roundLinks,
  totalRounds,
  pageTitle,
} from '../js/pairings.js';

const load = (f) => parseHTML(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')).document;

test('los kola turnaje jednotlivců', () => {
  const doc = load('pairings-individual.html');
  assert.equal(isTeamTournament(doc), false);
  assert.equal(pageTitle(doc), 'UCT Chess Festival 11/2026 - standard');
  assert.equal(totalRounds(doc), 7);
  assert.deepEqual(roundLinks(doc, 2), [1, 2, 3, 4]);
  const r = parseIndividualRound(doc);
  assert.equal(r.round, 4);
  assert.equal(r.date, '2026-11-14');
  assert.equal(r.time, '14:20');
  assert.equal(r.pairings.length, 8);
  const [first, second] = r.pairings;
  assert.equal(first.board, 1);
  assert.equal(first.white.name, 'Sivr Vojtech');
  assert.equal(first.white.rating, null); // na stránce 0 = bez ratingu
  assert.equal(first.white.points, 2.5);
  assert.equal(first.black.name, 'Jaros Jan');
  assert.equal(first.black.rating, 1301);
  assert.equal(first.result, '½ – ½');
  assert.equal(second.result, ''); // ještě se hraje
  assert.equal(second.white.rating, 1548);
  assert.equal(r.pairings[3].result, '1 – 0');
});

test('turnaj družstev: přehled a zápasy kola', () => {
  const overview = load('pairings-team-overview.html');
  assert.equal(isTeamTournament(overview), true);
  assert.deepEqual(roundLinks(overview, 3), [1, 2]);
  assert.equal(totalRounds(overview), 11);
  assert.equal(pageTitle(overview), 'Krajský přebor ÚKŠS 2026/2027');

  const r = parseTeamRound(load('pairings-team-round.html'));
  assert.equal(r.round, 2);
  assert.equal(r.date, '2026-11-08');
  assert.equal(r.time, '10:00');
  assert.equal(r.matches.length, 6);
  assert.deepEqual(r.matches[0], {
    board: 1,
    home: { name: 'Duras Ústí nad Labem "A"', nr: 12 },
    away: { name: 'ŠK Louny "A"', nr: 7 },
    result: '5½ : 2½',
  });
  assert.equal(r.matches[2].result, '4 : 4');
});

test('nadpis kola', () => {
  assert.deepEqual(parseRoundHeading('4. Kolo Datum kola 2026/11/14 Hodina 14:20'), { round: 4, date: '2026-11-14', time: '14:20' });
  assert.deepEqual(parseRoundHeading('Round 7 on 2026/11/14 at 9:00')?.round ?? null, null);
  assert.equal(parseRoundHeading('7. Round on 2026/11/14 at 9:00').time, '09:00');
});

test('číslo turnaje z čísla nebo odkazu', () => {
  assert.equal(parseTournamentInput('1516901'), 1516901);
  assert.equal(parseTournamentInput(' https://s3.chess-results.com/tnr1507857.aspx?lan=5&art=2 '), 1507857);
  assert.equal(parseTournamentInput('chess-results.com/tnr1507857.aspx'), 1507857);
  assert.equal(parseTournamentInput('https://example.com/tnr1507857.aspx'), null);
  assert.equal(parseTournamentInput('abc'), null);
});
