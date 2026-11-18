import test from 'node:test';
import assert from 'node:assert/strict';
import { maxCardinalityMatching, maxWeightMatching, matchingSize } from '../turnaj/js/matching.js';

// deterministický generátor náhodných čísel
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// hrubá síla: nejlepší (počet dvojic, váha) přes všechna párování
function brute(n, edges, maxcard) {
  const w = new Map();
  for (const [i, j, x] of edges) w.set(i * 64 + j, x).set(j * 64 + i, x);
  let best = null;
  const used = new Array(n).fill(false);
  function rec(v, card, total) {
    while (v < n && used[v]) v++;
    if (v >= n) {
      const better = !best
        || (maxcard ? card > best.card || (card === best.card && total > best.total) : total > best.total);
      if (better) best = { card, total };
      return;
    }
    used[v] = true;
    rec(v + 1, card, total); // v zůstane volný
    for (let u = v + 1; u < n; u++) {
      if (used[u] || !w.has(v * 64 + u)) continue;
      used[u] = true;
      rec(v + 1, card + 1, total + w.get(v * 64 + u));
      used[u] = false;
    }
    used[v] = false;
  }
  rec(0, 0, 0n);
  return best;
}

function evaluate(mate, edges) {
  const w = new Map();
  for (const [i, j, x] of edges) w.set(`${i}-${j}`, x).set(`${j}-${i}`, x);
  let total = 0n;
  let card = 0;
  for (let v = 0; v < mate.length; v++) {
    if (mate[v] > v) {
      assert.equal(mate[mate[v]], v, 'párování musí být symetrické');
      assert.ok(w.has(`${v}-${mate[v]}`), 'dvojice musí být hrana');
      total += w.get(`${v}-${mate[v]}`);
      card++;
    }
  }
  return { card, total };
}

test('maxWeightMatching odpovídá hrubé síle na náhodných grafech', () => {
  const r = rng(12345);
  for (let iter = 0; iter < 600; iter++) {
    const n = 2 + Math.floor(r() * 9);
    const dens = 0.2 + r() * 0.8;
    const edges = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (r() < dens) edges.push([i, j, BigInt(Math.floor(r() * (iter % 3 === 0 ? 4 : 50)))]);
      }
    }
    for (const maxcard of [false, true]) {
      const mate = maxWeightMatching(n, edges, maxcard);
      const got = evaluate(mate, edges);
      const exp = brute(n, edges, maxcard);
      if (maxcard) assert.equal(got.card, exp.card, `počet dvojic, iterace ${iter}`);
      assert.equal(got.total, exp.total, `váha, iterace ${iter}, maxcard ${maxcard}`);
    }
  }
});

test('maxWeightMatching zvládne velké BigInt váhy', () => {
  const big = 1n << 400n;
  const edges = [[0, 1, big + 1n], [1, 2, big + 5n], [2, 3, big + 1n], [0, 3, big]];
  const mate = maxWeightMatching(4, edges, true);
  const got = evaluate(mate, edges);
  assert.equal(got.card, 2);
  assert.equal(got.total, 2n * big + 5n);
});

test('maxCardinalityMatching odpovídá hrubé síle', () => {
  const r = rng(777);
  for (let iter = 0; iter < 800; iter++) {
    const n = 1 + Math.floor(r() * 12);
    const adj = Array.from({ length: n }, () => []);
    const edges = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (r() < 0.35) {
          adj[i].push(j);
          adj[j].push(i);
          edges.push([i, j, 0n]);
        }
      }
    }
    const mate = maxCardinalityMatching(n, adj);
    const got = evaluate(mate, edges);
    assert.equal(got.card, brute(n, edges, true).card, `iterace ${iter}`);
    assert.equal(matchingSize(mate), got.card);
  }
});
