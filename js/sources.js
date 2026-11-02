// Načtení soutěže z chess-results přímo v prohlížeči.
//
// chess-results neposílá hlavičku Access-Control-Allow-Origin, takže prohlížeč si jeho stránku
// stáhnout nesmí. Proto se čte přes prostředníka (proxy). Ve výchozím stavu se zkouší veřejné
// služby, v nastavení aplikace jde zadat vlastní adresu (viz worker/README.md).
import { parseRosters, parseRounds, splitSeason, tournamentTitle, tournamentNumber, shorten, pageUrl } from './parse.js';

export const DEFAULT_PROXIES = [
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
];

const TIMEOUT_MS = 45000; // stránky chess-results bývají pomalé, přes prostředníka tím spíš

export function proxyUrl(template, target) {
  return template.includes('{url}')
    ? template.replace('{url}', encodeURIComponent(target))
    : template.replace(/\/?$/, '/') + target;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!/<\s*(table|html)/i.test(text)) throw new Error('odpověď není stránka');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Stáhne stránku turnaje přes první prostředníka, který odpoví. */
export async function fetchPage(tnr, art, proxies) {
  const target = pageUrl(tnr, art);
  const list = (proxies ?? []).filter(Boolean);
  if (!list.length) throw new Error('Není nastavená žádná adresa pro načítání.');
  const problems = [];
  for (const tpl of list) {
    try {
      return await fetchText(proxyUrl(tpl, target));
    } catch (e) {
      problems.push(`${new URL(proxyUrl(tpl, target)).host}: ${e.name === 'AbortError' ? 'vypršel čas' : e.message}`);
    }
  }
  throw new Error(`Načtení se nepovedlo. ${problems.join('; ')}`);
}

const toDoc = (html) => new DOMParser().parseFromString(html, 'text/html');

/** Soutěž ze staženého nebo nahraného HTML soupisek, případně i rozlosování. */
export function buildCompetition({ tnr, boards, short, rosterHtml, drawHtml, season }) {
  const doc = toDoc(rosterHtml);
  const teams = parseRosters(doc).filter((t) => t.players.length);
  if (teams.length < 2) {
    throw new Error('Na stránce nejsou soupisky družstev. Vypadá to na turnaj jednotlivců nebo na jinou stránku.');
  }
  const title = tournamentTitle(doc);
  const [name, parsedSeason] = splitSeason(title);
  const rounds = drawHtml ? parseRounds(toDoc(drawHtml), teams.map((t) => t.name)) : [];
  return {
    id: `t${tnr}`,
    short: short || shorten(name),
    name: name || `Turnaj ${tnr}`,
    group: '',
    tnr,
    boards,
    season: parsedSeason || season || '',
    url: `https://chess-results.com/tnr${tnr}.aspx?lan=5`,
    teams,
    rounds,
    added: new Date().toISOString(),
    local: true,
  };
}

/**
 * Načte soutěž podle odkazu. Rozlosování je nepovinné, bez něj se vybírají družstva ručně.
 * onStep hlásí průběh, ať uživatel ví, co se děje.
 */
export async function loadCompetition({ url, boards, short, proxies, season }, onStep = () => {}) {
  const tnr = tournamentNumber(url);
  if (tnr === null) {
    throw new Error('Odkaz nevede na turnaj na chess-results.com. Čekám adresu ve tvaru https://chess-results.com/tnr1507857.aspx');
  }
  onStep('Stahuju soupisky…');
  const rosterHtml = await fetchPage(tnr, 8, proxies);
  let drawHtml = null;
  try {
    onStep('Stahuju rozlosování…');
    drawHtml = await fetchPage(tnr, 2, proxies);
  } catch {
    onStep('Rozlosování se nepodařilo načíst, družstva půjdou vybrat ručně.');
  }
  return buildCompetition({ tnr, boards, short, rosterHtml, drawHtml, season });
}

/** Odkaz na předvyplněné hlášení na GitHubu, když načtení v prohlížeči selže. */
export function issueUrl(repo, { url, boards, short }) {
  const p = new URLSearchParams({
    template: 'nova-soutez.yml',
    title: 'Nová soutěž',
    url: url ?? '',
    boards: String(boards ?? ''),
    short: short ?? '',
  });
  return `https://github.com/${repo}/issues/new?${p}`;
}
