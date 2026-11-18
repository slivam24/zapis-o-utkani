import test from 'node:test';
import assert from 'node:assert/strict';
import { pairDutch } from '../turnaj/js/dutch.js';
import { table } from './fixtures/turnaj/mastering-dutch-2026.mjs';

const pts = { '+': 1, '=': 0.5, '-': 0 };

// převod kódu z tabulky na záznam kola
function entry(code) {
  if (code === 'PAB') return { kind: 'PAB', opp: null, colour: null, points: 1 };
  if (code === 'HPB') return { kind: 'HPB', opp: null, colour: null, points: 0.5 };
  const res = code[0];
  const col = code[1];
  const opp = Number(code.slice(2));
  if (col === 'F') return { kind: res === '+' ? 'forfeitWin' : 'forfeitLoss', opp, colour: null, points: pts[res] };
  return { kind: 'game', opp, colour: col, points: pts[res] };
}

const codes = Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.split(' ')]));

function inputForRound(r) {
  const players = [];
  const others = [];
  for (const id of Object.keys(codes).map(Number)) {
    const history = codes[id].slice(0, r - 1).map(entry);
    const now = codes[id][r - 1];
    const p = { id, tpn: id, history };
    if (now === 'HPB') others.push(p);
    else players.push(p);
  }
  return { players, others, round: r, totalRounds: 9, initialColour: 'W' };
}

function expectedRound(r) {
  const pairs = new Set();
  let bye = null;
  for (const id of Object.keys(codes).map(Number)) {
    const c = codes[id][r - 1];
    if (c === 'PAB') bye = id;
    else if (c !== 'HPB') {
      const e = entry(c);
      if (e.colour === 'W') pairs.add(`${id}-${e.opp}`);
      else if (e.kind !== 'game' && id < e.opp) pairs.add(`${id}~${e.opp}`); // kontumace: barva neznámá
    }
  }
  return { pairs, bye };
}

for (let r = 1; r <= 9; r++) {
  test(`Mastering the Dutch 2026: ${r}. kolo`, () => {
    const out = pairDutch(inputForRound(r));
    const exp = expectedRound(r);
    const got = new Set(
      out.pairs.map(({ white, black }) => {
        const unordered = `${Math.min(white, black)}~${Math.max(white, black)}`;
        return exp.pairs.has(unordered) ? unordered : `${white}-${black}`;
      }),
    );
    assert.deepEqual([...got].sort(), [...exp.pairs].sort(), out.log.join('\n'));
    assert.equal(out.bye, exp.bye);
  });
}

// Testovací případy z bbpPairings (licence Apache 2.0), viz tests/fixtures/turnaj/bbp/README.md
import { readFileSync } from 'node:fs';
import { trfToTournament } from '../turnaj/js/trf.js';
import { buildPairingInput } from '../turnaj/js/model.js';

for (const name of ['dutch_2025_C5', 'dutch_2025_C9', 'issue_7']) {
  test(`bbpPairings: ${name}`, () => {
    const dir = new URL('./fixtures/turnaj/bbp/', import.meta.url);
    const t = trfToTournament(readFileSync(new URL(`${name}.trf`, dir), 'utf8'));
    const expected = readFileSync(new URL(`${name}.expected`, dir), 'utf8').trim().split('\n').slice(1);
    const out = pairDutch(buildPairingInput(t, t.roundsData.length + 1));
    const got = out.pairs.map((g) => `${g.white} ${g.black}`);
    if (out.bye !== null) got.push(`${out.bye} 0`);
    assert.deepEqual(got.sort(), expected.sort(), out.log.join('\n'));
  });
}
