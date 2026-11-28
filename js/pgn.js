// PGN ze zápisu: jedna partie na šachovnici, jen hlavičky a výsledek (tahy zápis nemá).
// Barvy podle čl. 3.4.1: domácí hrají bílými na lichých šachovnicích (1. bílé, 2. černé, 3. bílé…).
// Všechny texty jsou bez diakritiky a bez uvozovek, aby soubor přečetl každý program.
import { RESULTS, homeIsWhite, sortedLineup, boardResult, matchBoards } from './logic.js';

// znaky, které se rozkladem na písmeno a čárku nezbaví diakritiky
const SPECIAL = { ł: 'l', Ł: 'L', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ß: 'ss', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ı: 'i' };

/** Text pro PGN: bez diakritiky, bez uvozovek a apostrofů, jen tisknutelné ASCII. */
export function pgnText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁøØđĐßæÆœŒı]/g, (c) => SPECIAL[c])
    .replace(/["'`´‘’‚‛“”„‟«»‹›]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/½/g, '1/2')
    .replace(/[\\[\]]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Výsledek partie z pohledu bílého. code je výsledek z pohledu domácích (1 : 0 = vyhráli domácí). */
export function whiteResult(code, board) {
  const r = RESULTS[code];
  if (!r || code === 'XK') return '*'; // chybí výsledek; 0K : 0K nemá v PGN zápis
  const [w, b] = homeIsWhite(board) ? [r.hp, r.ap] : [r.ap, r.hp];
  if (w === b) return '1/2-1/2';
  return w > b ? '1-0' : '0-1';
}

const pgnDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? iso.replace(/-/g, '.') : '????.??.??');
const elo = (p) => [p?.fide, p?.rtg].find((n) => Number.isFinite(n) && n > 0);
const tag = (name, value) => `[${name} "${value}"]`;

/**
 * Partie zápisu pro PGN. Kontumované šachovnice (1K : 0K, 0K : 1K, 0K : 0K) se nehrály,
 * proto v PGN nejsou; vrací se zvlášť v `skipped`, aby to šlo uživateli říct.
 */
export function pgnGames(state, comp) {
  const boards = matchBoards(state, comp);
  const home = sortedLineup(state.home.lineup);
  const away = sortedLineup(state.away.lineup);
  const games = [];
  const skipped = [];
  for (let b = 1; b <= boards; b++) {
    const hp = home[b - 1];
    const ap = away[b - 1];
    const code = boardResult(state, b);
    if (!hp || !ap || RESULTS[code]?.forfeit) {
      skipped.push(b);
      continue;
    }
    const homeWhite = homeIsWhite(b);
    const [white, black] = homeWhite ? [hp, ap] : [ap, hp];
    const [whiteTeam, blackTeam] = homeWhite ? [state.home.team, state.away.team] : [state.away.team, state.home.team];
    games.push({ board: b, white, black, whiteTeam, blackTeam, result: whiteResult(code, b) });
  }
  return { games, skipped };
}

/** Celý soubor PGN zápisu. */
export function buildPgn(state, comp) {
  const { games } = pgnGames(state, comp);
  const event = pgnText(comp?.name || comp?.short) || '?';
  const site = pgnText(state.venue) || '?';
  const round = pgnText(state.round);
  return games
    .map((g) => {
      const tags = [
        tag('Event', event),
        tag('Site', site),
        tag('Date', pgnDate(state.date)),
        tag('Round', round ? `${round}.${g.board}` : '?'),
        tag('White', pgnText(g.white.name) || '?'),
        tag('Black', pgnText(g.black.name) || '?'),
        tag('Result', g.result),
        tag('WhiteTeam', pgnText(g.whiteTeam) || '?'),
        tag('BlackTeam', pgnText(g.blackTeam) || '?'),
        ...(elo(g.white) ? [tag('WhiteElo', elo(g.white))] : []),
        ...(elo(g.black) ? [tag('BlackElo', elo(g.black))] : []),
        tag('Board', g.board),
      ];
      return `${tags.join('\n')}\n\n${g.result}\n`;
    })
    .join('\n');
}
