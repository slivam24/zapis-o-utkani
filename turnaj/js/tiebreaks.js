// Pomocná hodnocení podle FIDE C.07 Play-Off and Tie-Break Regulations (platné od 1. 3. 2026),
// včetně čl. 16 (neodehraná kola ve švýcarském systému) a výjimky pro Cut-1 (čl. 16.5).

import { roundRecord } from './model.js';

export const TIEBREAKS = {
  DE: { label: 'Vzájemné partie', short: 'Vz', help: 'Direct Encounter (čl. 6)' },
  'BH-C1': { label: 'Buchholz bez nejhoršího', short: 'BH-1', help: 'Buchholz Cut-1 (čl. 8.1, 14.1)' },
  'BH-C2': { label: 'Buchholz bez 2 nejhorších', short: 'BH-2', help: 'Buchholz Cut-2 (čl. 14.2)' },
  'BH-M1': { label: 'Medián Buchholz', short: 'BH-M1', help: 'Buchholz Median-1 (čl. 14.3)' },
  'BH-M2': { label: 'Medián Buchholz 2', short: 'BH-M2', help: 'Buchholz Median-2 (čl. 14.4)' },
  BH: { label: 'Buchholz', short: 'BH', help: 'Buchholz (čl. 8.1)' },
  SB: { label: 'Sonneborn-Berger', short: 'SB', help: 'Sonneborn-Berger (čl. 9.1)' },
  'SB-C1': { label: 'Sonneborn-Berger bez nejhoršího', short: 'SB-1', help: 'Sonneborn-Berger Cut-1 (čl. 14.1)' },
  AOB: { label: 'Průměrný Buchholz soupeřů', short: 'AOB', help: 'Average of Opponents\' Buchholz (čl. 8.2)' },
  BPG: { label: 'Partie černými', short: 'Č', help: 'Number of Games Played with Black (čl. 7.3)' },
  BWG: { label: 'Výhry černými', short: 'VČ', help: 'Number of Games Won with Black (čl. 7.4)' },
  WIN: { label: 'Počet výher', short: 'V', help: 'Number of Wins, i bez hry (čl. 7.1)' },
  WON: { label: 'Vyhrané partie', short: 'VP', help: 'Number of Games Won (čl. 7.2)' },
  PS: { label: 'Progresivní skóre', short: 'PS', help: '(Sum of) Progressive Scores (čl. 7.5)' },
  REP: { label: 'Kola, která chtěl hrát', short: 'REP', help: 'Rounds one Elected to Play in (čl. 7.6)' },
  STD: { label: 'Standardní body', short: 'STD', help: 'Standard Points (čl. 7.7)' },
  ARO: { label: 'Průměrný rating soupeřů', short: 'ARO', help: 'Average Rating of Opponents (čl. 10.1)' },
  'ARO-C1': { label: 'Průměrný rating soupeřů bez nejnižšího', short: 'ARO-1', help: 'ARO Cut-1 (čl. 14.1)' },
  TPR: { label: 'Turnajový výkon', short: 'Rp', help: 'Tournament Performance Rating (čl. 10.2)' },
  RTNG: { label: 'Rating', short: 'Rtg', help: 'Rating (čl. 10.6)' },
  TPN: { label: 'Startovní číslo', short: 'SČ', help: 'Tournament Pairing Number (čl. 7.8)' },
};

// převod procentuálního zisku na rozdíl ratingu (FIDE Rating Regulations, tabulka 8.1.1)
const DP = [
  0, 7, 14, 21, 29, 36, 43, 50, 57, 65, 72, 80, 87, 95, 102, 110, 117, 125, 133, 141, 149, 158, 166, 175, 184,
  193, 202, 211, 220, 230, 240, 251, 262, 273, 284, 296, 309, 322, 336, 351, 366, 383, 401, 422, 444, 470, 501,
  538, 589, 677, 800,
];

export function ratingDifference(p) {
  const q = Math.round(p * 100);
  if (q >= 50) return DP[q - 50];
  return -DP[50 - q];
}

const roundHalfUp = (x) => Math.floor(x + 0.5);

/**
 * Data pro pomocná hodnocení po kole R.
 */
export function tiebreakData(t, R) {
  const pt = t.points;
  const ids = t.players.map((p) => p.id);
  const recs = new Map();
  const score = new Map();
  for (const id of ids) {
    const arr = [];
    let s = 0;
    for (let r = 1; r <= R; r++) {
      const rec = roundRecord(t, id, r) || { kind: 'absent', points: 0, opp: null };
      arr.push(rec);
      if (!rec.pending) s += rec.points;
    }
    recs.set(id, arr);
    score.set(id, s);
  }
  // čl. 16.1–16.2: kategorie neodehraných kol
  const isRequested = (rec) => rec.kind === 'HPB' || rec.kind === 'ZPB' || rec.kind === 'absent';
  const isVur = (rec) => isRequested(rec) || rec.kind === 'forfeitLoss';
  const played = (rec) => rec.kind === 'game' && !rec.pending;
  const adjusted = new Map();
  const cat5 = new Map();
  for (const id of ids) {
    const arr = recs.get(id);
    const flags = arr.map((rec, i) => {
      if (!isRequested(rec)) return false;
      for (let j = i + 1; j < arr.length; j++) if (!isVur(arr[j])) return false;
      return true; // následují jen VUR nebo je to poslední kolo
    });
    cat5.set(id, flags);
    let s = 0;
    arr.forEach((rec, i) => {
      if (rec.pending) return;
      s += flags[i] ? pt.draw : rec.points;
    });
    adjusted.set(id, s);
  }

  // příspěvky jednotlivých kol k BH a SB (čl. 16.4)
  const maxDummy = pt.draw * t.rounds;
  const contributions = new Map();
  for (const id of ids) {
    const own = score.get(id);
    const list = recs.get(id).map((rec) => {
      if (rec.pending) return null;
      if (played(rec)) {
        const os = adjusted.get(rec.opp) ?? 0;
        return { opp: os, sb: os * rec.points, vur: false, otb: true, rec };
      }
      let cap;
      if ((rec.kind === 'forfeitWin' || rec.kind === 'forfeitLoss') && rec.opp) cap = adjusted.get(rec.opp) ?? 0;
      else cap = maxDummy;
      const dummy = Math.min(own, cap);
      return { opp: dummy, sb: dummy * rec.points, vur: isVur(rec), otb: false, rec };
    }).filter(Boolean);
    contributions.set(id, list);
  }
  return { recs, score, adjusted, contributions, played };
}

// Odebrání nejméně významných hodnot s výjimkou čl. 16.5 (Cut-1 u hráče s VUR).
function cutBuchholz(list, low, high) {
  let items = list.map((c) => ({ v: c.opp, vur: c.vur }));
  for (let i = 0; i < low && items.length; i++) {
    const min = Math.min(...items.map((x) => x.v));
    const vurs = items.filter((x) => x.vur);
    let idx;
    if (vurs.length) {
      const lowestVur = vurs.reduce((a, b) => (b.v < a.v ? b : a));
      idx = lowestVur.v >= min ? items.indexOf(lowestVur) : items.findIndex((x) => x.v === min);
    } else {
      idx = items.findIndex((x) => x.v === min);
    }
    items.splice(idx, 1);
  }
  for (let i = 0; i < high && items.length; i++) {
    const max = Math.max(...items.map((x) => x.v));
    items.splice(items.findIndex((x) => x.v === max), 1);
  }
  return items.reduce((s, x) => s + x.v, 0);
}

function cutSB(list, cuts) {
  let items = list.map((c) => ({ opp: c.opp, v: c.sb, vur: c.vur }));
  for (let i = 0; i < cuts && items.length; i++) {
    const minOpp = Math.min(...items.map((x) => x.opp));
    const lsv = items.filter((x) => x.opp === minOpp).reduce((a, b) => (b.v < a.v ? b : a));
    const vurs = items.filter((x) => x.vur);
    let cut = lsv;
    if (vurs.length) {
      const lowestVur = vurs.reduce((a, b) => (b.v < a.v ? b : a));
      if (lowestVur.v >= lsv.v) cut = lowestVur;
    }
    items.splice(items.indexOf(cut), 1);
  }
  return items.reduce((s, x) => s + x.v, 0);
}

/** Hodnota jednoho pomocného hodnocení (bez vzájemných partií). */
export function tiebreakValue(code, id, data, t) {
  const { recs, score, contributions, played } = data;
  const list = contributions.get(id);
  const arr = recs.get(id).filter((r) => !r.pending);
  const pt = t.points;
  const p = t.players.find((x) => x.id === id);
  switch (code) {
    case 'BH':
      return list.reduce((s, c) => s + c.opp, 0);
    case 'BH-C1':
      return cutBuchholz(list, 1, 0);
    case 'BH-C2':
      return cutBuchholz(list, 2, 0);
    case 'BH-M1':
      return cutBuchholz(list, 1, 1);
    case 'BH-M2':
      return cutBuchholz(list, 2, 2);
    case 'SB':
      return list.reduce((s, c) => s + c.sb, 0);
    case 'SB-C1':
      return cutSB(list, 1);
    case 'AOB': {
      const opps = arr.filter(played).map((r) => r.opp);
      if (!opps.length) return 0;
      const bh = opps.map((o) => contributions.get(o).reduce((s, c) => s + c.opp, 0));
      return Math.round((bh.reduce((a, b) => a + b, 0) / opps.length) * 100) / 100;
    }
    case 'BPG':
      return arr.filter((r) => played(r) && r.colour === 'B').length;
    case 'BWG':
      return arr.filter((r) => played(r) && r.colour === 'B' && r.points === pt.win).length;
    case 'WIN':
      return arr.filter((r) => r.points === pt.win && r.kind !== 'forfeitLoss').length;
    case 'WON':
      return arr.filter((r) => played(r) && r.points === pt.win).length;
    case 'PS': {
      let s = 0;
      let total = 0;
      for (const r of arr) {
        s += r.points;
        total += s;
      }
      return total;
    }
    case 'REP':
      return t.roundsData.length - arr.filter((r) => ['HPB', 'ZPB', 'absent', 'forfeitLoss'].includes(r.kind)).length;
    case 'STD': {
      let s = 0;
      arr.forEach((r, i) => {
        if (r.opp) {
          const o = recs.get(r.opp)?.[i];
          const op = o ? o.points : 0;
          if (r.points > op) s += 1;
          else if (r.points === op) s += 0.5;
        } else if (r.points > pt.draw) s += 1;
        else if (r.points === pt.draw) s += 0.5;
      });
      return s;
    }
    case 'ARO':
    case 'ARO-C1': {
      const rs = arr.filter(played).map((r) => Number(t.players.find((x) => x.id === r.opp)?.rating) || 0).filter((x) => x > 0);
      if (code === 'ARO-C1' && rs.length > 1) rs.splice(rs.indexOf(Math.min(...rs)), 1);
      if (!rs.length) return 0;
      return roundHalfUp(rs.reduce((a, b) => a + b, 0) / rs.length);
    }
    case 'TPR': {
      const games = arr.filter(played).filter((r) => Number(t.players.find((x) => x.id === r.opp)?.rating) > 0);
      if (!games.length) return 0;
      const aro = roundHalfUp(games.reduce((s, r) => s + Number(t.players.find((x) => x.id === r.opp).rating), 0) / games.length);
      const frac = games.reduce((s, r) => s + r.points, 0) / (games.length * pt.win);
      return aro + ratingDifference(frac);
    }
    case 'RTNG':
      return Number(p?.rating) || 0;
    case 'TPN':
      return -(p?.tpn || 0);
    default:
      return score.get(id);
  }
}

/**
 * Vzájemné partie (čl. 6). Vrací uspořádané skupiny (v rámci skupiny je stále shoda).
 */
export function directEncounter(group, data, t) {
  const win = t.points.win;
  const { recs, played } = data;
  const meet = (a, b) => {
    const games = recs.get(a).filter((r) => played(r) && r.opp === b);
    if (!games.length) return null;
    return games.reduce((s, r) => s + r.points, 0) / games.length;
  };
  function solve(S) {
    if (S.length < 2) return [S];
    const pts = new Map(S.map((id) => [id, 0]));
    const missing = new Map(S.map((id) => [id, 0]));
    let allMet = true;
    for (let i = 0; i < S.length; i++) {
      for (let j = 0; j < S.length; j++) {
        if (i === j) continue;
        const m = meet(S[i], S[j]);
        if (m === null) {
          missing.set(S[i], missing.get(S[i]) + 1);
          allMet = false;
        } else pts.set(S[i], pts.get(S[i]) + m);
      }
    }
    if (allMet) {
      const sorted = [...S].sort((a, b) => pts.get(b) - pts.get(a));
      const groups = [];
      for (const id of sorted) {
        const last = groups[groups.length - 1];
        if (last && pts.get(last[0]) === pts.get(id)) last.push(id);
        else groups.push([id]);
      }
      if (groups.length === 1) return groups;
      return groups.flatMap((g) => (g.length > 1 ? solve(g) : [g]));
    }
    // čl. 6.3: jen ten, kdo je sám na čele bez ohledu na chybějící partie
    const ranked = [];
    let rest = [...S];
    for (;;) {
      const max = (id) => pts.get(id) + missing.get(id) * win;
      const lead = rest.find((id) => rest.every((o) => o === id || pts.get(id) > max(o)));
      if (!lead) break;
      ranked.push([lead]);
      rest = rest.filter((x) => x !== lead);
      if (rest.length < 2) break;
    }
    if (!ranked.length) return [S];
    if (rest.length === 1) return [...ranked, rest];
    if (!rest.length) return ranked;
    return [...ranked, ...solve(rest)];
  }
  return solve(group);
}

/**
 * Pořadí po kole R.
 * @returns {Array<{ player, rank, score, tb: Record<string, number>, tied: boolean }>}
 */
export function computeStandings(t, R = t.roundsData.length, codes = t.tiebreaks) {
  const data = tiebreakData(t, R);
  const rows = t.players.map((p) => {
    const tb = {};
    for (const c of codes) if (c !== 'DE') tb[c] = tiebreakValue(c, p.id, data, t);
    return { player: p, score: data.score.get(p.id), tb };
  });
  const byId = new Map(rows.map((r) => [r.player.id, r]));
  let groups = [];
  const sortedScore = [...rows].sort((a, b) => b.score - a.score);
  for (const r of sortedScore) {
    const g = groups[groups.length - 1];
    if (g && byId.get(g[0]).score === r.score) g.push(r.player.id);
    else groups.push([r.player.id]);
  }
  const deFlags = new Map();
  for (const code of codes) {
    const next = [];
    for (const g of groups) {
      if (g.length < 2) {
        next.push(g);
        continue;
      }
      if (code === 'DE') {
        const parts = directEncounter(g, data, t);
        if (parts.length > 1) for (const id of g) deFlags.set(id, true);
        next.push(...parts);
        continue;
      }
      const val = (id) => byId.get(id).tb[code];
      const sorted = [...g].sort((a, b) => val(b) - val(a));
      let run = [];
      for (const id of sorted) {
        if (run.length && Math.abs(val(run[0]) - val(id)) > 1e-9) {
          next.push(run);
          run = [];
        }
        run.push(id);
      }
      next.push(run);
    }
    groups = next;
  }
  const out = [];
  let place = 1;
  for (const g of groups) {
    const members = [...g].sort((a, b) => byId.get(a).player.tpn - byId.get(b).player.tpn);
    for (const id of members) {
      const row = byId.get(id);
      out.push({ ...row, rank: place, tied: g.length > 1, deUsed: !!deFlags.get(id) });
    }
    place += g.length;
  }
  return out;
}
