// Losování švýcarského systému podle C.04.3 FIDE (Dutch) System, platné od 1. 2. 2026
// (schváleno Radou FIDE 28. 10. 2025), spolu s C.04.1 a C.04.2 ve znění od 1. 2. 2026.
//
// Pravidla definují posloupnost kandidátů (transpozice v S2, výměny mezi S1 a S2, výběr MDP)
// a pořadí kritérií [C1]–[C21]. Zvolí se první kandidát v posloupnosti, který kritéria splní
// nejlépe (čl. 3.4 a 3.8). Místo zkoušení kandidátů jednoho po druhém tu:
//   1. pro skupinu nejdřív určíme možné množiny „propadajících“ hráčů (downfloaterů) podle
//      kritérií, která závisí jen na nich ([C4] úplnost, [C5] PAB, [C6], [C7], [C8], [C9]),
//   2. vážené párování najde nejlepší dosažitelné hodnoty kritérií [C10]–[C21],
//   3. další vážená párování vyberou z kandidátů s touto hodnotou ten, který je v posloupnosti
//      pravidel první: nejdřív množinu MDP, pak transpozici MDP, pak výměnu, pak transpozici.
// Výsledek je stejný, jako kdyby se kandidáti zkoušeli postupně, jen je výpočet rychlý.

import { maxCardinalityMatching, maxWeightMatching } from './matching.js';

const COMBO_LIMIT = 250000;

/** Opačná barva. */
const flip = (c) => (c === 'W' ? 'B' : 'W');

/**
 * Údaje hráče potřebné k losování (barvy, plovoucí, nárok na PAB).
 * @param {object} p hráč ze vstupu
 * @param {object} cfg body a kolo
 */
export function playerPairingData(p, cfg) {
  const colours = [];
  const opps = new Set();
  let unplayed = 0;
  let hadPab = false;
  let freeWin = false;
  for (const h of p.history) {
    if (h.kind === 'game') {
      colours.push(h.colour);
      opps.add(h.opp);
    } else {
      unplayed++;
      if (h.kind === 'PAB') hadPab = true;
      if (h.points >= cfg.win) freeWin = true;
    }
  }
  let w = 0;
  for (const c of colours) w += c === 'W' ? 1 : -1;
  const cd = w; // počet bílých minus počet černých
  const n = colours.length;
  const last = colours[n - 1] ?? null;
  const last2 = n >= 2 && colours[n - 1] === colours[n - 2] ? colours[n - 1] : null;
  let pref = null;
  let strength = 0; // 0 žádná, 1 mírná, 2 silná, 3 absolutní
  if (n > 0) {
    if (cd < -1 || cd > 1 || last2) {
      strength = 3;
      if (cd < -1) pref = 'W';
      else if (cd > 1) pref = 'B';
      else pref = flip(last2);
    } else if (cd === -1 || cd === 1) {
      strength = 2;
      pref = cd === -1 ? 'W' : 'B';
    } else {
      strength = 1;
      pref = flip(last);
    }
  }
  return {
    colours,
    opps,
    cd,
    pref,
    strength,
    unplayed,
    pabEligible: !hadPab && !freeWin,
  };
}

/** Plovoucí hráči v jednotlivých kolech (čl. 1.4). Vrací pole 'down' | 'up' | null podle kola. */
export function floatHistory(players, cfg) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const scoreBefore = new Map();
  for (const p of players) {
    const arr = [];
    let s = p.initialScore ?? 0;
    for (const h of p.history) {
      arr.push(s);
      s += h.points;
    }
    scoreBefore.set(p.id, arr);
  }
  const out = new Map();
  for (const p of players) {
    const f = p.history.map((h, r) => {
      if (h.kind === 'game') {
        const me = scoreBefore.get(p.id)[r];
        const opp = byId.get(h.opp);
        const os = opp ? scoreBefore.get(opp.id)[r] : h.oppScoreBefore;
        if (os === undefined || me === os) return null;
        return me > os ? 'down' : 'up';
      }
      if (h.kind === 'PAB') return 'down';
      if (h.points > cfg.loss) return 'down';
      return null;
    });
    out.set(p.id, f);
  }
  return out;
}

/**
 * Přidělení barev dvojici podle čl. 5.
 * @param {object} a hráč s vyšším pořadím (čl. 1.2)
 * @param {object} b druhý hráč
 * @param {'W'|'B'} initialColour vylosovaná barva
 * @returns {'W'|'B'} barva hráče a
 */
export function allocateColour(a, b, initialColour) {
  // 5.2.1 vyhovět oběma (hráč bez preference přijme soupeřovu)
  if (a.pref && b.pref && a.pref !== b.pref) return a.pref;
  if (a.pref && !b.pref) return a.pref;
  if (!a.pref && b.pref) return flip(b.pref);
  if (a.pref && b.pref) {
    // 5.2.2 silnější preference; u dvou absolutních (lídři) větší rozdíl barev
    if (a.strength !== b.strength) return a.strength > b.strength ? a.pref : flip(b.pref);
    if (a.strength === 3 && Math.abs(a.cd) !== Math.abs(b.cd)) {
      return Math.abs(a.cd) > Math.abs(b.cd) ? a.pref : flip(b.pref);
    }
  }
  // 5.2.3 střídat barvy vůči poslednímu kolu, kdy měli různé barvy (jen odehrané partie)
  const ca = a.colours;
  const cb = b.colours;
  for (let i = 1; i <= Math.min(ca.length, cb.length); i++) {
    const x = ca[ca.length - i];
    const y = cb[cb.length - i];
    if (x !== y) return flip(x);
  }
  // 5.2.4 preference hráče s vyšším pořadím
  if (a.pref) return a.pref;
  // 5.2.5 podle startovního čísla a vylosované barvy
  return a.tpn % 2 === 1 ? initialColour : flip(initialColour);
}

function* combinations(arr, m, start = 0, acc = []) {
  if (acc.length === m) {
    yield acc.slice();
    return;
  }
  for (let i = start; i <= arr.length - (m - acc.length); i++) {
    acc.push(arr[i]);
    yield* combinations(arr, m, i + 1, acc);
    acc.pop();
  }
}

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Porovnání sestupně seřazených skóre (menší je lepší). */
function cmpProfile(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity;
    const y = b[i] ?? -Infinity;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const cmpArr = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

export class PairingError extends Error {}

/**
 * Vylosuje kolo.
 * @param {object} input
 * @param {Array<object>} input.players hráči k vylosování: { id, tpn, history: [{kind, opp, colour, points}] }
 *   kind: 'game' (odehraná partie), 'forfeitWin', 'forfeitLoss', 'doubleForfeit', 'PAB', 'HPB', 'FPB', 'ZPB', 'absent'
 * @param {number} input.round číslo losovaného kola
 * @param {number} input.totalRounds počet kol turnaje
 * @param {'W'|'B'} input.initialColour vylosovaná barva
 * @param {object} [input.points] body: { win, draw, loss }
 * @param {Array<object>} [input.others] ostatní hráči (nelosovaní), kvůli plovoucím
 * @returns {{ pairs: Array<{white, black}>, bye: any, log: string[] }}
 */
export function pairDutch(input) {
  const cfg = { win: 1, draw: 0.5, loss: 0, ...(input.points || {}) };
  const log = [];
  const all = [...input.players, ...(input.others || [])];
  const floats = floatHistory(all, cfg);
  const isFinal = input.round === input.totalRounds;
  const maxScore = input.totalRounds * cfg.win;

  // hráči v pořadí čl. 1.2 (body, startovní číslo)
  const P = input.players.map((p) => {
    const score = (p.initialScore ?? 0) + p.history.reduce((s, h) => s + h.points, 0);
    const d = playerPairingData(p, cfg);
    const f = floats.get(p.id);
    const r = p.history.length; // počet předchozích kol
    return {
      ...d,
      id: p.id,
      tpn: p.tpn,
      score: score + (p.virtual ?? 0),
      top: isFinal && score > maxScore / 2,
      floatPrev: r >= 1 ? f[r - 1] : null,
      floatPrev2: r >= 2 ? f[r - 2] : null,
    };
  });
  P.sort((a, b) => b.score - a.score || a.tpn - b.tpn);
  P.forEach((p, i) => (p.idx = i));
  const n = P.length;
  if (n === 0) return { pairs: [], bye: null, log };
  if (n === 1) {
    if (!P[0].pabEligible) throw new PairingError('Jediného hráče nelze nechat volného (už měl volno).');
    return { pairs: [], bye: P[0].id, log };
  }

  // [C1]–[C3] absolutní kritéria
  const compat = Array.from({ length: n }, () => new Uint8Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = P[i];
      const b = P[j];
      let ok = !a.opps.has(b.id);
      if (ok && a.strength === 3 && b.strength === 3 && a.pref === b.pref && !a.top && !b.top) ok = false;
      compat[i][j] = compat[j][i] = ok ? 1 : 0;
    }
  }
  const odd = n % 2 === 1;

  // Lze spárovat množinu S tak, aby [C1]–[C3] platila a volno dostal způsobilý hráč (se skóre pabScore)?
  function canComplete(S, pabScore = null, extraForbid = null) {
    const m = S.length;
    const needBye = m % 2 === 1;
    if (m === 0) return true;
    const size = needBye ? m + 1 : m;
    const adj = Array.from({ length: size }, () => []);
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        if (compat[S[i]][S[j]] && !(extraForbid && extraForbid(S[i], S[j]))) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
      if (needBye) {
        const p = P[S[i]];
        if (p.pabEligible && (pabScore === null || p.score === pabScore)) {
          adj[i].push(m);
          adj[m].push(i);
        }
      }
    }
    const mate = maxCardinalityMatching(size, adj);
    return mate.every((x) => x !== -1);
  }

  const everyone = P.map((p) => p.idx);
  let vstar = null; // [C5] nejnižší možné skóre hráče s volnem
  if (odd) {
    const levels = [...new Set(P.filter((p) => p.pabEligible).map((p) => p.score))].sort((a, b) => a - b);
    for (const s of levels) {
      if (canComplete(everyone, s)) {
        vstar = s;
        break;
      }
    }
    if (vstar === null) throw new PairingError('Kolo nelze úplně vylosovat (čl. 1.9.3): rozhodne hlavní rozhodčí.');
  } else if (!canComplete(everyone)) {
    throw new PairingError('Kolo nelze úplně vylosovat (čl. 1.9.3): rozhodne hlavní rozhodčí.');
  }

  // skupiny podle bodů
  const groups = [];
  for (const p of P) {
    if (!groups.length || groups[groups.length - 1].score !== p.score) groups.push({ score: p.score, members: [] });
    groups[groups.length - 1].members.push(p.idx);
  }

  const byRank = (a, b) => a - b; // idx je pořadí podle čl. 1.2

  /**
   * Možné množiny downfloaterů skupiny B podle [C4]–[C7].
   * @returns {{ m: number, profile: number[], list: number[][] } | null}
   */
  function enumerateD(B, mdpSet, L, isLast, collectAll, relaxStructure = false) {
    const structural = (a, b) => compat[a][b] && (relaxStructure || !(mdpSet.has(a) && mdpSet.has(b)));
    // největší počet dvojic uvnitř skupiny
    const idxOf = new Map(B.map((v, i) => [v, i]));
    const adj = B.map(() => []);
    for (let i = 0; i < B.length; i++) {
      for (let j = i + 1; j < B.length; j++) {
        if (structural(B[i], B[j])) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }
    const M = maxCardinalityMatching(B.length, adj);
    const mu = M.filter((x) => x !== -1).length / 2;
    const restPairable = (D) => {
      const ds = new Set(D);
      const rest = B.filter((v) => !ds.has(v));
      const a2 = rest.map(() => []);
      const loc = new Map(rest.map((v, i) => [v, i]));
      for (const v of rest) {
        for (const j of adj[idxOf.get(v)]) {
          const w = B[j];
          if (loc.has(w)) a2[loc.get(v)].push(loc.get(w));
        }
      }
      // začít z největšího párování celé skupiny (bez dvojic s hráči z D): stačí pár zlepšení
      const init = rest.map((v) => {
        const j = M[idxOf.get(v)];
        return j === -1 || ds.has(B[j]) ? -1 : loc.get(B[j]);
      });
      return maxCardinalityMatching(rest.length, a2, init).every((x) => x !== -1);
    };
    const lowerOk = (D) => {
      if (isLast) {
        if (D.length === 0) return true;
        if (D.length > 1) return false;
        const p = P[D[0]];
        return odd && p.pabEligible && p.score === vstar;
      }
      return canComplete([...D, ...L], odd ? vstar : null);
    };
    for (let m = B.length - 2 * mu; m <= B.length; m += 2) {
      if (isLast && m > 1) break;
      if (binom(B.length, m) > COMBO_LIMIT) {
        throw new PairingError('Skupina je příliš složitá pro výpočet (příliš mnoho možností propadajících hráčů).');
      }
      // seskupit podle profilu skóre [C7]
      const byProfile = new Map();
      for (const D of combinations(B, m)) {
        const prof = D.map((v) => P[v].score).sort((a, b) => b - a);
        const key = prof.join(',');
        if (!byProfile.has(key)) byProfile.set(key, { profile: prof, sets: [] });
        byProfile.get(key).sets.push(D);
      }
      const profiles = [...byProfile.values()].sort((a, b) => cmpProfile(a.profile, b.profile));
      for (const { profile, sets } of profiles) {
        const ok = [];
        for (const D of sets) {
          if (lowerOk(D) && restPairable(D)) {
            ok.push(D);
            if (!collectAll) break;
          }
        }
        if (ok.length) return { m, profile, list: ok };
      }
    }
    return null;
  }

  const pairs = [];
  let carried = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const residents = groups[gi].members;
    const mdpSet = new Set(carried);
    const B = [...carried, ...residents].sort(byRank);
    const L = groups.slice(gi + 1).flatMap((g) => g.members);
    const isLast = gi === groups.length - 1;
    const res = pairBracket(B, mdpSet, residents, L, isLast, gi);
    pairs.push(...res.pairs);
    carried = res.down.sort(byRank);
    log.push(
      `Skupina ${groups[gi].score} b.: ${B.map((v) => P[v].tpn).join(', ')}`
        + (mdpSet.size ? ` (z vyšší skupiny: ${[...mdpSet].map((v) => P[v].tpn).join(', ')})` : '')
        + ` → ${res.pairs.map(([a, b]) => `${P[a].tpn}–${P[b].tpn}`).join(', ') || 'bez dvojic'}`
        + (res.down.length ? `; propadá: ${res.down.map((v) => P[v].tpn).join(', ')}` : ''),
    );
  }
  if (carried.length > 1) throw new PairingError('Losování skončilo s více nespárovanými hráči (vnitřní chyba).');
  const byeIdx = carried.length ? carried[0] : null;

  // barvy a pořadí šachovnic (C.04.2 čl. 3.6)
  const out = pairs.map(([x, y]) => {
    const [a, b] = x < y ? [x, y] : [y, x];
    const ca = allocateColour(P[a], P[b], input.initialColour || 'W');
    const white = ca === 'W' ? P[a] : P[b];
    const black = ca === 'W' ? P[b] : P[a];
    return { white: white.id, black: black.id, hi: P[a], lo: P[b] };
  });
  out.sort((p, q) => q.hi.score - p.hi.score || q.hi.score + q.lo.score - (p.hi.score + p.lo.score) || p.hi.tpn - q.hi.tpn);
  return {
    pairs: out.map(({ white, black }) => ({ white, black })),
    bye: byeIdx === null ? null : P[byeIdx].id,
    log,
  };

  // ---------------------------------------------------------------------------------------
  function pairBracket(B, mdpSet, residents, L, isLast, gi) {
    let relax = false;
    let est = enumerateD(B, mdpSet, L, isLast, true);
    if (!est) {
      // Krajní případ: jediné úplné vylosování vyžaduje dvojici dvou MDP. Pravidla s ním nepočítají.
      relax = true;
      est = enumerateD(B, mdpSet, L, isLast, true, true);
      if (!est) throw new PairingError(`Skupinu s ${P[B[0]].score} b. nelze spárovat tak, aby šlo dolosovat celé kolo.`);
      log.push('Pozor: skupinu šlo spárovat jen dvojicí dvou hráčů z vyšších skupin.');
    }
    const structural = (a, b) => compat[a][b] && (relax || !(mdpSet.has(a) && mdpSet.has(b)));

    // [C8] a [C9]
    let family = est.list;
    if (!isLast && family.length > 1) {
      const nextRes = groups[gi + 1].members;
      const L2 = groups.slice(gi + 2).flatMap((g) => g.members);
      const lastN = gi + 1 === groups.length - 1;
      const scored = family.map((D) => {
        const N = [...D, ...nextRes].sort(byRank);
        const r = enumerateD(N, new Set(D), L2, lastN, false)
          ?? enumerateD(N, new Set(D), L2, lastN, false, true);
        return { D, key: r ? [r.m, r.profile] : [Infinity, []] };
      });
      const cmp8 = (x, y) => x.key[0] - y.key[0] || cmpProfile(x.key[1], y.key[1]);
      scored.sort(cmp8);
      family = scored.filter((s) => cmp8(s, scored[0]) === 0).map((s) => s.D);
    }
    if (isLast && est.m === 1 && family.length > 1) {
      const best = Math.min(...family.map((D) => P[D[0]].unplayed));
      family = family.filter((D) => P[D[0]].unplayed === best);
    }

    const m = est.m;
    if (B.length === m) return { pairs: [], down: family[0] };

    // ----- ceny kritérií [C10]–[C21]
    const levelsSet = new Set();
    for (const a of B) {
      for (const b of B) {
        if (mdpSet.has(a) && !mdpSet.has(b) && structural(a, b)) levelsSet.add(P[a].score - P[b].score);
      }
    }
    const levels = [...levelsSet].sort((x, y) => y - x);
    const nl = levels.length;
    const NPOS = 8 + 4 * nl;
    const base = BigInt(B.length + 2);
    const pow = [1n];
    for (let i = 1; i <= NPOS; i++) pow.push(pow[i - 1] * base);
    const enc = (comp) => {
      let v = 0n;
      for (let i = 0; i < NPOS; i++) if (comp[i]) v += BigInt(comp[i]) * pow[NPOS - 1 - i];
      return v;
    };
    const pairCost = new Map();
    function costOf(a, b) {
      const key = a < b ? a * n + b : b * n + a;
      if (pairCost.has(key)) return pairCost.get(key);
      const [hi, lo] = a < b ? [P[a], P[b]] : [P[b], P[a]];
      const ch = allocateColour(hi, lo, input.initialColour || 'W');
      const cl = flip(ch);
      const comp = new Array(NPOS).fill(0);
      const topPair = hi.top || lo.top;
      for (const [x, c] of [[hi, ch], [lo, cl]]) {
        if (topPair) {
          const ncd = x.cd + (c === 'W' ? 1 : -1);
          if (Math.abs(ncd) > 2) comp[0]++;
          const k = x.colours.length;
          if (k >= 2 && x.colours[k - 1] === c && x.colours[k - 2] === c) comp[1]++;
        }
        if (x.strength >= 1 && x.pref !== c) comp[2]++;
        if (x.strength >= 2 && x.pref !== c) comp[3]++;
      }
      const am = mdpSet.has(a);
      const bm = mdpSet.has(b);
      if (am !== bm) {
        const mdp = am ? P[a] : P[b];
        const res = am ? P[b] : P[a];
        const li = levels.indexOf(mdp.score - res.score);
        if (res.floatPrev === 'up') comp[5]++;
        if (res.floatPrev2 === 'up') comp[7]++;
        if (mdp.floatPrev === 'down') comp[8 + li]++;
        if (res.floatPrev === 'up') comp[8 + nl + li]++;
        if (mdp.floatPrev2 === 'down') comp[8 + 2 * nl + li]++;
        if (res.floatPrev2 === 'up') comp[8 + 3 * nl + li]++;
      }
      const v = enc(comp);
      pairCost.set(key, v);
      return v;
    }
    const floatCost = (v) => {
      if (mdpSet.has(v)) return 0n;
      const comp = new Array(NPOS).fill(0);
      if (P[v].floatPrev === 'down') comp[4]++;
      if (P[v].floatPrev2 === 'down') comp[6]++;
      return enc(comp);
    };

    // Je rodina množin D součinem (všechny m-prvkové podmnožiny sjednocení)?
    const U = [...new Set(family.flat())].sort(byRank);
    const isProduct = m === 0 || family.length === binom(U.length, m);

    // Zkratka: první kandidát v posloupnosti (bez výměn a transpozic), který je dokonalý
    // (čl. 3.4.1), se přijme hned. Nulová cena je nejlepší možná, takže výsledek je stejný.
    {
      const mdpList = B.filter((v) => mdpSet.has(v));
      const res = residents.slice().sort(byRank);
      const inD = family[0].filter((v) => mdpSet.has(v)).length;
      const M1 = mdpList.length - inD;
      const direct = [];
      const S1M = mdpList.slice(0, M1);
      const Dd = mdpList.slice(M1);
      let ok = M1 <= res.length;
      for (let i = 0; ok && i < M1; i++) direct.push([S1M[i], res[i]]);
      const Rr = res.slice(M1);
      const kk = (Rr.length - (m - Dd.length)) / 2;
      if (ok && Number.isInteger(kk) && kk >= 0) {
        for (let i = 0; i < kk; i++) direct.push([Rr[i], Rr[kk + i]]);
        Dd.push(...Rr.slice(2 * kk));
        ok = direct.every(([a, b]) => structural(a, b) && costOf(a, b) === 0n)
          && Dd.every((v) => floatCost(v) === 0n)
          && family.some((D) => D.length === Dd.length && D.every((v) => Dd.includes(v)));
        if (ok) return { pairs: direct, down: Dd };
      }
    }

    /**
     * Nejlepší úplné spárování skupiny při daných omezeních.
     * Vrací { pairs, D, crit, low } nebo null.
     */
    function stage({ fixed = [], edgeOk = () => true, floatOk = () => true, lowEdge = () => 0n, lowFloat = () => 0n, lowRange = 1n }) {
      const fixedV = new Set(fixed.flat());
      let fixedCrit = 0n;
      for (const [a, b] of fixed) fixedCrit += costOf(a, b);
      const candidates = isProduct ? [null] : family;
      let best = null;
      for (const Dfix of candidates) {
        let free;
        let dummies = 0;
        let Dset = null;
        if (Dfix) {
          if (Dfix.some((v) => fixedV.has(v) || !floatOk(v))) continue;
          Dset = new Set(Dfix);
          free = B.filter((v) => !fixedV.has(v) && !Dset.has(v));
        } else {
          free = B.filter((v) => !fixedV.has(v));
          dummies = m;
        }
        const nv = free.length + dummies;
        if (nv === 0) {
          const crit = fixedCrit + (Dset ? [...Dset].reduce((s, v) => s + floatCost(v), 0n) : 0n);
          const cand = { pairs: [], D: Dfix ? Dfix.slice() : [], crit, low: 0n };
          if (!best || crit < best.crit) best = cand;
          continue;
        }
        const raw = [];
        for (let i = 0; i < free.length; i++) {
          for (let j = i + 1; j < free.length; j++) {
            const a = free[i];
            const b = free[j];
            if (structural(a, b) && edgeOk(a, b)) raw.push([i, j, costOf(a, b) * lowRange + lowEdge(a, b)]);
          }
          if (dummies) {
            const v = free[i];
            if (U.includes(v) && floatOk(v)) {
              for (let d = 0; d < dummies; d++) raw.push([i, free.length + d, floatCost(v) * lowRange + lowFloat(v)]);
            }
          }
        }
        let top = 1n;
        for (const e of raw) if (e[2] >= top) top = e[2] + 1n;
        const mate = maxWeightMatching(nv, raw.map(([i, j, c]) => [i, j, top - c]), true);
        if (mate.some((x) => x === -1)) continue;
        const ps = [];
        const D = Dfix ? Dfix.slice() : [];
        let total = 0n;
        for (let i = 0; i < free.length; i++) {
          const j = mate[i];
          if (j >= free.length) {
            D.push(free[i]);
            total += floatCost(free[i]) * lowRange + lowFloat(free[i]);
          } else if (j > i) {
            ps.push([free[i], free[j]]);
            total += costOf(free[i], free[j]) * lowRange + lowEdge(free[i], free[j]);
          }
        }
        if (Dset) for (const v of Dset) total += floatCost(v) * lowRange + lowFloat(v);
        const crit = fixedCrit + total / lowRange;
        const low = total % lowRange;
        if (!best || crit < best.crit || (crit === best.crit && low < best.low)) {
          best = { pairs: ps, D, crit, low };
        }
      }
      if (best) best.pairs = [...fixed, ...best.pairs];
      return best;
    }

    const opt = stage({});
    if (!opt) throw new PairingError('Skupinu nelze spárovat.');
    const OPT = opt.crit;
    const okOpt = (r) => r && r.crit === OPT;

    let fixed = [];
    const mdps = B.filter((v) => mdpSet.has(v));
    const forcedFloat = new Set();
    let R = residents.slice().sort(byRank);
    const sampleD = opt.D;
    const M1 = mdps.length - sampleD.filter((v) => mdpSet.has(v)).length;

    if (mdps.length && M1 > 0) {
      // výběr MDP do S1 (čl. 4.4): lexikograficky podle BSN
      let S1M = null;
      for (const comb of combinations(mdps, M1)) {
        const inS1 = new Set(comb);
        const limbo = mdps.filter((v) => !inS1.has(v));
        const r = stage({
          edgeOk: (a, b) => !limbo.includes(a) && !limbo.includes(b),
          floatOk: (v) => !inS1.has(v),
        });
        if (okOpt(r)) {
          S1M = comb;
          break;
        }
      }
      if (!S1M) throw new PairingError('Nepodařilo se vybrat MDP (vnitřní chyba).');
      const inS1 = new Set(S1M);
      const limbo = mdps.filter((v) => !inS1.has(v));
      limbo.forEach((v) => forcedFloat.add(v));
      // transpozice v S2 pro MDP: partner prvního MDP co nejnižší BSN, pak druhého...
      const W = BigInt(R.length + 1);
      const posR = new Map(R.map((v, i) => [v, BigInt(i)]));
      const posM = new Map(S1M.map((v, i) => [v, i]));
      const lowRange = W ** BigInt(M1) + 1n;
      const r = stage({
        edgeOk: (a, b) => !forcedFloat.has(a) && !forcedFloat.has(b),
        floatOk: (v) => !inS1.has(v),
        lowEdge: (a, b) => {
          const [mdp, res] = posM.has(a) ? [a, b] : posM.has(b) ? [b, a] : [null, null];
          if (mdp === null) return 0n;
          return posR.get(res) * W ** BigInt(M1 - 1 - posM.get(mdp));
        },
        lowRange,
      });
      if (!okOpt(r)) throw new PairingError('Vnitřní chyba při párování MDP.');
      fixed = r.pairs.filter(([a, b]) => inS1.has(a) || inS1.has(b));
      const used = new Set(fixed.flat());
      R = R.filter((v) => !used.has(v));
    } else {
      mdps.forEach((v) => forcedFloat.add(v));
    }

    // zbytek (homogenní skupina nebo remainder): výměny a transpozice
    const mR = sampleD.length - forcedFloat.size;
    const k = (R.length - mR) / 2;
    if (k > 0) {
      const bsn = new Map(R.map((v, i) => [v, i + 1]));
      const nR = R.length;
      const inS1o = (v) => bsn.get(v) <= k;
      const fixedV = new Set(fixed.flat());
      const baseOk = (a, b) => !forcedFloat.has(a) && !forcedFloat.has(b) && !fixedV.has(a) && !fixedV.has(b);
      // klíč výměny (čl. 4.3.2): [počet, rozdíl součtů, největší BSN přesunuté z S1, nejmenší BSN přesunuté do S1]
      const P3 = 1n << BigInt(nR + 2);
      const R4 = 1n << BigInt(nR + 2);
      const edgesCount = BigInt(nR + 2);
      const D2 = BigInt(2 * nR + 2) * edgesCount; // rozsah součtu 2. složky
      const D3 = P3 * edgesCount;
      const D4 = R4 * edgesCount;
      const exKey = (size, sumd, out3, in4) =>
        ((BigInt(size) * D2 + BigInt(sumd + nR)) * D3 + (P3 - out3)) * D4 + (R4 - in4);
      const lowRangeEx = edgesCount * D2 * D3 * D4 + 1n;
      const exEdge = (a, b) => {
        if (!bsn.has(a) || !bsn.has(b)) return exKey(0, 0, 0n, 0n);
        const ba = bsn.get(a);
        const bb = bsn.get(b);
        if (inS1o(a) && inS1o(b)) {
          const out = Math.max(ba, bb);
          return exKey(1, -out, 1n << BigInt(out), 0n);
        }
        if (!inS1o(a) && !inS1o(b)) {
          const inn = Math.min(ba, bb);
          return exKey(1, inn, 0n, 1n << BigInt(nR + 1 - inn));
        }
        return exKey(0, 0, 0n, 0n);
      };
      const exFloat = (v) => {
        if (bsn.has(v) && inS1o(v)) return exKey(1, -bsn.get(v), 1n << BigInt(bsn.get(v)), 0n);
        return exKey(0, 0, 0n, 0n);
      };
      const r1 = stage({
        fixed,
        edgeOk: baseOk,
        floatOk: (v) => !fixedV.has(v),
        lowEdge: exEdge,
        lowFloat: exFloat,
        lowRange: lowRangeEx,
      });
      if (!okOpt(r1)) throw new PairingError('Vnitřní chyba při výměnách.');
      // S1 po výměně
      const S1 = new Set(R.filter(inS1o));
      for (const [a, b] of r1.pairs) {
        if (!bsn.has(a) || !bsn.has(b) || fixed.some(([x, y]) => x === a && y === b)) continue;
        if (inS1o(a) && inS1o(b)) S1.delete(bsn.get(a) > bsn.get(b) ? a : b);
        else if (!inS1o(a) && !inS1o(b)) S1.add(bsn.get(a) < bsn.get(b) ? a : b);
      }
      for (const v of r1.D) if (bsn.has(v) && inS1o(v)) S1.delete(v);
      const X = R.filter((v) => S1.has(v));
      const Y = R.filter((v) => !S1.has(v));
      // transpozice: lexikograficky nejmenší posloupnost partnerů hráčů z S1
      const Wt = BigInt(Y.length + 1);
      const posX = new Map(X.map((v, i) => [v, i]));
      const posY = new Map(Y.map((v, i) => [v, BigInt(i)]));
      const lowRangeTr = Wt ** BigInt(X.length) + 1n;
      const r2 = stage({
        fixed,
        edgeOk: (a, b) => baseOk(a, b) && posX.has(a) !== posX.has(b),
        floatOk: (v) => !fixedV.has(v) && !posX.has(v),
        lowEdge: (a, b) => {
          const [x, y] = posX.has(a) ? [a, b] : [b, a];
          return posY.get(y) * Wt ** BigInt(X.length - 1 - posX.get(x));
        },
        lowRange: lowRangeTr,
      });
      if (!okOpt(r2)) throw new PairingError('Vnitřní chyba při transpozicích.');
      return { pairs: r2.pairs, down: r2.D };
    }
    const r3 = stage({ fixed, floatOk: (v) => !fixed.flat().includes(v) });
    if (!okOpt(r3)) throw new PairingError('Vnitřní chyba při párování.');
    return { pairs: r3.pairs, down: r3.D };
  }
}
