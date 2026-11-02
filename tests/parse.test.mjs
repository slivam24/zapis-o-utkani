import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import {
  parseRosters, parseRounds, parseTypes, parseDate, splitSeason, tournamentTitle,
  tournamentNumber, shorten, headerMap, clean,
} from '../js/parse.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const doc = (file) => parseHTML(fs.readFileSync(path.join(FIX, file), 'utf8')).document;
const html = (s) => parseHTML(s).document;

test('typy hráčů: Z se vypouští', () => {
  assert.deepEqual(parseTypes('Z,ZK'), ['ZK']);
  assert.deepEqual(parseTypes('Z,H'), ['H']);
  assert.deepEqual(parseTypes('Z'), []);
  assert.deepEqual(parseTypes(''), []);
  assert.deepEqual(parseTypes('C'), ['C']);
});

test('soupisky: družstva a kapitáni', () => {
  const teams = parseRosters(doc('rosters.html'));
  assert.deepEqual(teams.map((t) => t.name), ['Duras Ústí nad Labem "B"', 'SK Děčín "B"']);
  assert.equal(teams[0].captain, 'Pavel Chrz');
  assert.equal(teams[1].captain, 'Mašek Daniel');
});

test('soupisky: hráči, typy a ratingy', () => {
  const [a, b] = parseRosters(doc('rosters.html'));
  assert.equal(a.players.length, 4);
  assert.deepEqual(a.players[0], { no: 1, name: 'Kriz, Denis', types: [], rtg: 2003, nat: null, fide: null });
  assert.deepEqual(a.players[1].types, ['K']);
  assert.deepEqual(a.players[2].types, ['H']);
  assert.equal(a.players[2].rtg, null, 'rating 0 znamená bez ratingu');
  assert.deepEqual(a.players[3].types, ['ZK']);
  assert.deepEqual(b.players[0].types, ['V']);
  assert.deepEqual(b.players[1].types, ['C'], 'cizinec se počítá do limitu');
});

test('soupisky: oddělené sloupce RtgN a RtgI', () => {
  const d = html(`<table>
    <tr><td colspan="7">1. ŠK Příklad "A" (Rtg prům.:2000) Kapitán: Jan Novák, a@b.cz</td></tr>
    <tr><th>Šach.</th><th>Jméno</th><th>RtgN</th><th>RtgI</th><th>FED</th><th>Typ</th><th>Body</th></tr>
    <tr><td>1</td><td>Novak, Jan</td><td>1950</td><td>1920</td><td>CZE</td><td>Z,K</td><td>0</td></tr>
    <tr><td>2</td><td>Mala, Eva</td><td>1800</td><td>0</td><td>CZE</td><td>H</td><td>0</td></tr>
  </table>`);
  const [t] = parseRosters(d);
  assert.deepEqual(t.players[0], { no: 1, name: 'Novak, Jan', types: ['K'], rtg: null, nat: 1950, fide: 1920 });
  assert.equal(t.players[1].fide, null, 'nula znamená bez FIDE ratingu');
  assert.equal(t.players[1].nat, 1800);
});

test('záhlaví sloupců se pozná jen jako záhlaví', () => {
  assert.equal(headerMap(['Šach.', 'Jméno', 'Rtg', 'FED', 'Typ']).rtg, 2);
  assert.equal(headerMap(['Šach.', 'Jméno', 'RtgN', 'RtgI']).nat, 2);
  assert.equal(headerMap(['1', 'Novak, Jan', '1950']), null);
  assert.equal(headerMap(['Čís.', 'Družstvo', 'Družstvo']), null);
});

test('rozlosování: kola se rozdělí a nechytne se navigace', () => {
  const names = ['SPORTIS Svádov-Olšinky "B"', 'TJ Libouchec "B"', 'ŠK Teplice "C"', 'Teplice Chess Club "C"', 'SK Děčín "D"', 'KŠ Štětí'];
  const rounds = parseRounds(doc('rounds.html'), names);
  assert.deepEqual(rounds.map((r) => r.no), [1, 2, 3]);
  assert.deepEqual(rounds.map((r) => r.matches.length), [2, 2, 1]);
  assert.deepEqual(rounds.map((r) => r.date), ['2026-10-18', '2026-11-08', '2026-11-22']);
  assert.equal(rounds[0].time, '10:00');
  assert.deepEqual(rounds[0].matches[0], { home: 'SPORTIS Svádov-Olšinky "B"', away: 'TJ Libouchec "B"' });
  assert.equal(rounds[1].matches[0].home, 'TJ Libouchec "B"');
});

test('rozlosování: vnořená tabulka s textem celé stránky nevytvoří kolo', () => {
  const big = '1. Kolo Datum kola 2026/10/18 Hodina 10:00 ' + 'další text '.repeat(40);
  const d = html(`<table><tr><td>${big}</td></tr>
    <tr><td>1. Kolo Datum kola 2026/10/18 Hodina 10:00</td></tr>
    <tr><td>1</td><td>Tým A</td><td>Tým B</td><td></td></tr></table>`);
  const rounds = parseRounds(d, ['Tým A', 'Tým B']);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].matches.length, 1);
});

test('datum v obou tvarech', () => {
  assert.equal(parseDate('Kolo 3 dne 2026/11/01 v 9:00'), '2026-11-01');
  assert.equal(parseDate('1.11.2026'), '2026-11-01');
  assert.equal(parseDate('bez data'), null);
});

test('sezóna z názvu', () => {
  assert.deepEqual(splitSeason("Krajský přebor III. třídy 'B' ÚKŠS 2026/27"), ["Krajský přebor III. třídy 'B' ÚKŠS", '2026/2027']);
  assert.deepEqual(splitSeason('Krajský přebor KŠSV 25/26'), ['Krajský přebor KŠSV', '2025/2026']);
  assert.deepEqual(splitSeason('Extraliga 2026/2027'), ['Extraliga', '2026/2027']);
  assert.deepEqual(splitSeason('Turnaj bez sezóny'), ['Turnaj bez sezóny', null]);
});

test('název turnaje: titulek má přednost před upozorněním serveru', () => {
  const notice = 'Poznámka: Kvůli redukci zatížení serveru denním skenováním všech odkazů jsou odkazy starších turnajů skryté:';
  const d = html(`<html><head><title>Chess-Results Server Chess-results.com - Krajský přebor KŠSV 25/26</title></head>
    <body><h2>${notice}</h2><h2>Krajský přebor KŠSV 25/26</h2></body></html>`);
  assert.equal(tournamentTitle(d), 'Krajský přebor KŠSV 25/26');
});

test('název turnaje: bez titulku se vezme vhodný nadpis', () => {
  const d = html(`<html><head><title>Chess-Results Server Chess-results.com</title></head>
    <body><h2>Poznámka: Kvůli redukci zatížení serveru</h2><h2>1. liga západ 2026/2027</h2>
    <h3>Los družstev pro všechna kola</h3></body></html>`);
  assert.equal(tournamentTitle(d), '1. liga západ 2026/2027');
  assert.equal(tournamentTitle(html('<html><body><p>nic</p></body></html>')), '');
});

test('odkaz na turnaj: přijme jen chess-results', () => {
  for (const [url, tnr] of [
    ['https://chess-results.com/tnr1507857.aspx?lan=5', 1507857],
    ['https://s1.chess-results.com/tnr1508693.aspx?lan=5&art=8&SNode=S0', 1508693],
    ['http://www.chess-results.com/tnr99.aspx', 99],
    ['  https://s3.chess-results.com/tnr1508277.aspx  ', 1508277],
  ]) assert.equal(tournamentNumber(url), tnr, url);

  for (const url of [
    'https://www.chess.cz/soutez/3459/',
    'https://evil.example.com/tnr1.aspx',
    'https://chess-results.com.evil.example/tnr1.aspx',
    'javascript:alert(1)',
    'chess-results.com/tnr1.aspx',
    '',
    'https://chess-results.com/Default.aspx?lan=5',
  ]) assert.equal(tournamentNumber(url), null, url);
});

test('zkratka z názvu', () => {
  assert.equal(shorten('Krajský přebor ÚKŠS'), 'Krajský přebor');
  assert.ok(shorten('Velmi dlouhý název soutěže družstev').length <= 22);
  assert.equal(shorten(''), 'Soutěž');
});

test('clean sjednotí mezery', () => {
  assert.equal(clean('  a \n b  c '), 'a b c');
});
