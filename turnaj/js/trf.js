// Formát TRF (FIDE Tournament Report File, TRF-16), řádky 001 s pevnými sloupci.
// Načtení: z TRF vznikne turnaj v našem modelu. Uložení: zpráva pro zápočet na FIDE
// a výměna dat s jinými programy (např. kontrola losování programem bbpPairings / JaVaFo).

import { newTournament, roundRecord, scoreAfter, POINTS_DEFAULT } from './model.js';
import { computeStandings } from './tiebreaks.js';

const col = (line, from, to) => (line.length >= from ? line.slice(from - 1, to).trim() : '');

/** Rozloží TRF na jednoduchou strukturu. */
export function parseTRF(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = { header: {}, players: [], rounds: null, initialColour: null, points: {} };
  for (const line of lines) {
    const code = line.slice(0, 3);
    if (code === '001') {
      const results = [];
      for (let pos = 92; pos <= line.length; pos += 10) {
        const block = line.slice(pos - 1, pos + 7);
        if (!block.trim()) {
          results.push(null);
          continue;
        }
        const opp = Number(block.slice(0, 4).trim()) || 0;
        const c = (block[5] || ' ').toLowerCase();
        const res = (block[7] || ' ').toUpperCase();
        results.push({ opp, colour: c === 'w' ? 'W' : c === 'b' ? 'B' : null, code: res });
      }
      while (results.length && results[results.length - 1] === null) results.pop();
      out.players.push({
        tpn: Number(col(line, 5, 8)),
        sex: col(line, 10, 10),
        title: col(line, 11, 13),
        name: col(line, 15, 47),
        rating: Number(col(line, 49, 52)) || 0,
        fed: col(line, 54, 56),
        fideId: col(line, 58, 68),
        birth: col(line, 70, 79),
        points: Number(col(line, 81, 84).replace(',', '.')) || 0,
        rank: Number(col(line, 86, 89)) || 0,
        results,
      });
    } else if (code === 'XXR') {
      out.rounds = Number(line.slice(3).trim()) || null;
    } else if (code === 'XXC') {
      const v = line.slice(3).toLowerCase();
      if (v.includes('white1')) out.initialColour = 'W';
      else if (v.includes('black1')) out.initialColour = 'B';
    } else if (/^BB[WDLZFU]$/.test(code)) {
      out.points[code[2]] = Number(line.slice(3).trim());
    } else if (/^\d{3}$/.test(code)) {
      out.header[code] = line.slice(4).trim();
    }
  }
  return out;
}

/**
 * Převede TRF na turnaj. Kola, která v TRF ještě nejsou vylosovaná (jen volna na žádost),
 * se uloží jako požadavky na volno.
 */
export function trfToTournament(text) {
  const trf = parseTRF(text);
  const h = trf.header;
  const t = newTournament({
    name: h['012'] || 'Turnaj z TRF',
    city: h['022'] || '',
    fed: h['032'] || '',
    dateFrom: h['042'] || '',
    dateTo: h['052'] || '',
    arbiter: h['102'] || '',
    deputy: h['112'] || '',
    timeControl: h['122'] || '',
  });
  const pts = { ...POINTS_DEFAULT };
  if (trf.points.W !== undefined) pts.win = pts.forfeitWin = pts.fpb = trf.points.W;
  if (trf.points.D !== undefined) pts.draw = pts.hpb = trf.points.D;
  if (trf.points.L !== undefined) pts.loss = trf.points.L;
  if (trf.points.F !== undefined) pts.forfeitLoss = pts.zpb = trf.points.F;
  pts.pab = trf.points.U !== undefined ? trf.points.U : pts.win;
  t.points = pts;
  const players = [...trf.players].sort((a, b) => a.tpn - b.tpn);
  t.players = players.map((p) => ({
    id: p.tpn,
    tpn: p.tpn,
    name: p.name,
    title: p.title,
    rating: p.rating,
    fideId: p.fideId === '0' ? '' : p.fideId,
    fed: p.fed,
    club: '',
    birth: p.birth,
    sex: p.sex === 'w' || p.sex === 'f' ? 'f' : p.sex === 'm' ? 'm' : '',
    status: 'active',
    withdrawnFrom: null,
  }));
  const maxR = Math.max(0, ...players.map((p) => p.results.length));
  // kola s alespoň jednou partií nebo volnem z losování
  let paired = 0;
  for (let r = 1; r <= maxR; r++) {
    if (players.some((p) => {
      const x = p.results[r - 1];
      return x && (x.opp > 0 || x.code === 'U');
    })) paired = r;
  }
  for (let r = 1; r <= paired; r++) {
    const rd = { pairs: [], byes: [] };
    const seen = new Set();
    for (const p of players) {
      const x = p.results[r - 1];
      if (!x) continue;
      if (x.opp > 0) {
        if (seen.has(p.tpn)) continue;
        const o = players.find((q) => q.tpn === x.opp);
        const y = o?.results[r - 1];
        seen.add(p.tpn).add(x.opp);
        const white = x.colour === 'B' ? x.opp : p.tpn;
        const black = white === p.tpn ? x.opp : p.tpn;
        const wx = white === p.tpn ? x : y;
        const bx = white === p.tpn ? y : x;
        rd.pairs.push({ white, black, result: pairResult(wx?.code, bx?.code) });
      } else {
        const type = { U: 'PAB', H: 'HPB', F: 'FPB', Z: 'ZPB', '+': 'PAB', '-': 'ZPB' }[x.code];
        if (type) rd.byes.push({ player: p.tpn, type });
      }
    }
    t.roundsData.push(rd);
  }
  for (let r = paired + 1; r <= maxR; r++) {
    for (const p of players) {
      const x = p.results[r - 1];
      const type = x && { H: 'HPB', F: 'FPB', Z: 'ZPB', '-': 'ZPB' }[x.code];
      if (type) (t.requests[r] ||= {})[p.tpn] = type;
    }
  }
  t.rounds = Math.max(trf.rounds || 0, maxR, paired + 1);
  t.initialColour = trf.initialColour || inferInitialColour(players);
  if (t.roundsData.length >= 1) t.tpnFrozen = true;
  return t;
}

function pairResult(w, b) {
  if (w === '+' || b === '-') return b === '-' && w === '-' ? '--' : '+-';
  if (w === '-' && b === '+') return '-+';
  if (w === '-' && b === '-') return '--';
  if (w === '1' || w === 'W' || b === '0' || b === 'L') return '1-0';
  if (w === '0' || w === 'L' || b === '1' || b === 'W') return '0-1';
  if (w === '=' || w === 'D' || b === '=' || b === 'D') return '½-½';
  return null;
}

// Vylosovaná barva podle 1. kola: barva nejvýše nasazeného hráče s barvou; u každého dalšího
// startovního čísla se barva otočí (stejně jako bbpPairings).
function inferInitialColour(players) {
  for (let r = 0; r < 50; r++) {
    const withColour = players.filter((p) => p.results[r]?.colour);
    if (!withColour.length) continue;
    const order = [...players].sort((a, b) => a.tpn - b.tpn);
    for (let i = 0; i < order.length; i++) {
      const c = order[i].results[r]?.colour;
      if (c) return i % 2 === 0 ? c : c === 'W' ? 'B' : 'W';
    }
  }
  return null;
}

const pad = (s, n, right = false) => {
  s = String(s ?? '');
  if (s.length > n) s = s.slice(0, n);
  return right ? s.padStart(n, ' ') : s.padEnd(n, ' ');
};

function fmtTrfPoints(x) {
  return (Math.round(x * 10) / 10).toFixed(1);
}

const isoToTrf = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.replace(/-/g, '/') : d || '');

/** Uloží turnaj do TRF-16. */
export function tournamentToTRF(t) {
  const R = t.roundsData.length;
  const standings = computeStandings(t, R);
  const rankOf = new Map(standings.map((s) => [s.player.id, s.rank]));
  const tpnOf = new Map(t.players.map((p) => [p.id, p.tpn]));
  const lines = [];
  const hdr = (code, v) => v && lines.push(`${code} ${v}`);
  hdr('012', t.name);
  hdr('022', t.city);
  hdr('032', t.fed);
  hdr('042', isoToTrf(t.dateFrom));
  hdr('052', isoToTrf(t.dateTo));
  lines.push(`062 ${t.players.length}`);
  lines.push(`072 ${t.players.filter((p) => Number(p.rating) > 0).length}`);
  lines.push('082 0');
  lines.push('092 Individual: Swiss-System (FIDE Dutch)');
  hdr('102', t.arbiter);
  hdr('112', t.deputy);
  hdr('122', t.timeControl);
  for (const p of [...t.players].sort((a, b) => a.tpn - b.tpn)) {
    let line = '001 ';
    line += pad(p.tpn, 4, true) + ' ';
    line += pad(p.sex === 'f' ? 'w' : p.sex === 'm' ? 'm' : '', 1);
    line += pad(p.title, 3, true) + ' ';
    line += pad(p.name, 33) + ' ';
    line += pad(Number(p.rating) > 0 ? p.rating : '', 4, true) + ' ';
    line += pad(p.fed, 3) + ' ';
    line += pad(p.fideId, 11, true) + ' ';
    line += pad(isoToTrf(p.birth), 10) + ' ';
    line += pad(fmtTrfPoints(scoreAfter(t, p.id, R)), 4, true) + ' ';
    line += pad(rankOf.get(p.id) ?? '', 4, true);
    for (let r = 1; r <= R; r++) {
      const rec = roundRecord(t, p.id, r);
      line += '  ' + trfBlock(t, rec, tpnOf);
    }
    lines.push(line);
  }
  lines.push(`XXR ${t.rounds}`);
  if (t.initialColour) lines.push(`XXC ${t.initialColour === 'W' ? 'white1' : 'black1'}`);
  return lines.join('\n') + '\n';
}

function trfBlock(t, rec, tpnOf) {
  if (!rec) return '        ';
  if (rec.opp) {
    const opp = pad(tpnOf.get(rec.opp), 4, true);
    const c = rec.colour === 'W' ? 'w' : 'b';
    let code = ' ';
    if (rec.kind === 'game' && !rec.pending) {
      code = rec.points === t.points.win ? '1' : rec.points === t.points.draw ? '=' : '0';
    } else if (rec.kind === 'forfeitWin') code = '+';
    else if (rec.kind === 'forfeitLoss') code = '-';
    return `${opp} ${c} ${code}`;
  }
  const code = { PAB: 'U', HPB: 'H', FPB: 'F', ZPB: 'Z', absent: 'Z' }[rec.kind] || 'Z';
  return `0000 - ${code}`;
}
