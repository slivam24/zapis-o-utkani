import * as L from './logic.js';
import { renderPages } from './render.js';
import { buildPdf } from './pdf.js';
import { loadData, refreshData, reloadUserComps, dataSummary, ensureComp, isLoaded } from './data.js';
import { buildFromFiles, readFiles, roundsFor, issueUrl } from './sources.js';
import { clean, tournamentNumber, exportUrl } from './parse.js';
import * as store from './store.js';
import { makeBackup, parseBackup, mergeArchive, olderThan } from './archive.js';
import { helpPage, privacyPage } from './pages.js';
import { encodeLink, decodeLink, hasLink } from './link.js';
import qrcode from './vendor/qrcode.js';
import { REGIONS, groupCompetitions, standardShort, regionCompCount, isFinished as isFinishedComp } from './catalog.js';

const REPO = 'slivam24/zapis-o-utkani';

// ---------- pomocné ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const view = $('#view');
const stepsEl = $('#steps');

let DATA = { competitions: [], generated: null };
let S = store.loadDraft() ?? L.newMatch();
// Otevřený krok se pamatuje pro tuto kartu, aby ho nezrušilo obnovení stránky (třeba po aktualizaci).
const TAB_KEY = 'zapis.tab';
const savedTab = () => {
  try {
    return sessionStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
};
function rememberTab(id) {
  try {
    sessionStorage.setItem(TAB_KEY, id);
  } catch {
    /* bez sessionStorage se jen nepamatuje */
  }
}
let tab = 'zapas';
// stav panelu Přidat soutěž
let openBoard = null; // která šachovnice má otevřený výběr výsledku
let editRow = null; // hráč v sestavě, kterému se upravuje jméno nebo Elo ('home:3')
let addComp = { open: false, busy: false, url: '', boards: '8', short: '', msg: '', error: '', downloaded: false };

const TABS = [
  ['zapas', 'Zápas'],
  ['sestavy', 'Sestavy'],
  ['vysledky', 'Výsledky'],
  ['zaver', 'Závěr a podpisy'],
  ['vystup', 'Výstup'],
];

const NOTE_PRESETS = [
  ['Bez připomínek', 'Utkání proběhlo bez připomínek.'],
  ['Hodiny', 'Hodiny nastavila a obsluhovala osoba zajištěná pořadatelem (čl. 2.5.3).'],
  ['Zpoždění rozhodčího', 'Delegovaný rozhodčí se dostavil se zpožděním, důvod: '],
  ['Zpoždění družstva', 'Družstvo odevzdalo sestavu se zpožděním z omluvitelných důvodů (čl. 3.6.9.3.1): '],
  ['Pozdní začátek', 'Utkání začalo se zpožděním, důvod: '],
  ['Námitka kapitána', 'Námitka kapitána družstva: '],
];

// ---------- zobrazení: počítač, nebo tablet a mobil ----------
// Automaticky podle zařízení: myš (jemný ukazatel s najetím) = počítač, jinak dotykové zobrazení.
const detectUi = () => (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ? 'desktop' : 'touch');
const uiMode = () => {
  const pref = store.uiPref();
  return pref === 'desktop' || pref === 'touch' ? pref : detectUi();
};
const UI_NAMES = { desktop: 'Počítač', touch: 'Tablet a mobil' };

function applyUi() {
  document.documentElement.dataset.ui = uiMode();
}

// ---------- funkce, které jde v Nastavení vypnout ----------
const FEATURES = [
  ['fullscreen', 'Celá obrazovka', 'Velký přehled průběhu utkání a zápis přes celou obrazovku.', true],
  ['editPlayers', 'Úprava hráčů v sestavě', 'Tužka u hráče v sestavě: oprava jména nebo Ela.', true],
  ['manualPlayer', 'Hráč mimo soupisku', 'Ruční přidání hráče, který na soupisce chybí.', true],
  ['notePresets', 'Rychlé texty záznamu', 'Tlačítka s připravenými větami do záznamu rozhodčího.', true],
  ['logos', 'Loga v zápisu', 'Logo svazu, krajského svazu a družstev v zápisu.', true],
  ['mail', 'Odeslání e-mailem', 'Odeslání hotového zápisu e-mailem.', true],
  ['png', 'Obrázek PNG', 'Stažení zápisu i jako obrázek, nejen PDF.', true],
  ['share', 'Sdílení', 'Sdílení PDF do jiné aplikace (na tabletu a telefonu).', true],
  ['qrSign', 'Podpis na telefonu', 'QR kód, kterým se zápis přenese z počítače na telefon a podepíše se tam prstem.', true],
  ['addComp', 'Přidání vlastní soutěže', 'Soutěž, která v nabídce není, jde přidat ze souborů z chess-results.', false],
];
const RETENTION = [6, 12, 24, 0];

const settings = () => store.loadSettings();
function feature(key) {
  const v = settings().features?.[key];
  return typeof v === 'boolean' ? v : FEATURES.find((f) => f[0] === key)?.[3] ?? true;
}
const retentionMonths = () => {
  const v = settings().retention;
  return RETENTION.includes(v) ? v : 12;
};
function setSetting(path, value) {
  const s = settings();
  if (path.startsWith('features.')) s.features = { ...(s.features ?? {}), [path.slice(9)]: value };
  else s[path] = value;
  store.saveSettings(s);
}

// Archivovaný zápis nese kopii údajů o soutěži, aby šel otevřít i tam, kde soutěž v datech není.
const comp = () => DATA.competitions.find((c) => c.id === S.compId) ?? S.compInfo;
const compSnapshot = (c = comp()) =>
  c ? { name: c.name ?? '', short: c.short ?? '', group: c.group ?? '', season: c.season ?? '', boards: c.boards ?? null, teams: [], rounds: [] } : undefined;
const boards = () => L.matchBoards(S, comp());
const teamOf = (side) => comp()?.teams?.find((t) => t.name === S[side].team);

/** Soupisky vybrané soutěže: stáhnou se až když jsou potřeba. Po načtení překreslí pohled. */
let compLoadError = '';
let compLoading = null; // id soutěže, která se právě stahuje
let compFailed = null; // id soutěže, kterou se nepodařilo stáhnout (znovu až po obnovení)
async function loadCompData(id = S.compId, { fresh = false } = {}) {
  const c = DATA.competitions.find((x) => x.id === id);
  if (!c || (isLoaded(c) && !fresh)) return;
  compLoadError = '';
  compFailed = null;
  try {
    await ensureComp(DATA, id, { fresh });
  } catch {
    compFailed = id;
    compLoadError = navigator.onLine === false
      ? 'Soupisky této soutěže v zařízení ještě nejsou a teď jsi bez internetu. Připoj se a zkus to znovu.'
      : 'Soupisky této soutěže se nepodařilo stáhnout. Zkus to znovu ikonou ↻ v hlavičce.';
  }
}

/**
 * Předem stáhne soupisky soutěží, které se budou hodit bez internetu: celostátní a soutěže mého kraje.
 * Jen když je nastavený kraj a jen probíhající soutěže, po jedné, aby to nezdržovalo.
 */
async function prefetchMyRegion() {
  const region = settings().region;
  if (!region || navigator.onLine === false) return;
  const todo = DATA.competitions.filter(
    (c) => !c.local && !isLoaded(c) && (c.region === region || c.region === 'CR') && !isFinishedComp(c),
  );
  for (const c of todo) {
    try {
      await ensureComp(DATA, c.id);
    } catch {
      /* zkusí se příště */
    }
  }
}

function save() {
  S.updatedAt = new Date().toISOString();
  showSaveWarning(!store.saveDraft(S));
}

/**
 * Když se rozpracovaný zápis nevejde do úložiště zařízení, musí to být vidět hned a pořád:
 * po obnovení stránky by výsledky a podpisy zmizely. Lišta zmizí, jakmile se zápis zase uloží.
 */
function showSaveWarning(failed) {
  const bar = $('.store-bar');
  if (!failed) return bar?.remove();
  if (bar) return;
  const b = document.createElement('div');
  b.className = 'update-bar store-bar';
  b.setAttribute('role', 'alert');
  b.innerHTML =
    '<span>Zápis se nepodařilo uložit, úložiště zařízení je plné. Stránku neobnovuj, uvolni místo v archivu.</span>' +
    '<button class="btn small" type="button">Archiv</button>';
  $('button', b).addEventListener('click', () => goTo('archiv'));
  document.body.append(b);
}

/**
 * Požádá prohlížeč, aby data aplikace (archiv) nemazal sám, třeba při nedostatku místa nebo
 * u Safari po týdnu bez návštěvy. Volá se až při uložení do archivu: Firefox se na to ptá
 * uživatele a dotaz při otevření stránky by obtěžoval.
 */
function askPersistentStorage() {
  try {
    navigator.storage?.persisted?.().then((yes) => yes || navigator.storage.persist?.()).catch(() => {});
  } catch {
    /* prohlížeč to neumí */
  }
}

/** Po uvolnění místa (smazání z archivu) zkusit rozpracovaný zápis uložit znovu. */
function retrySave() {
  if ($('.store-bar')) save();
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
}

function setTeam(side, name) {
  S[side].team = name;
  S[side].lineup = [];
  S.results = {};
  const t = teamOf(side);
  S[side].captain = L.defaultCaptain(t);
  if (side === 'home' && !S.venue) S.venue = store.venueFor(name);
}

function resetCompetition(id) {
  S.compId = id;
  S.round = '';
  S.home = { team: '', lineup: [], captain: '' };
  S.away = { team: '', lineup: [], captain: '' };
  S.results = {};
}

// ---------- pohledy ----------
/** Hláška pod odkazem. Mění se při psaní, proto se vykresluje zvlášť. */
function urlHint(url) {
  const tnr = tournamentNumber(url);
  if (tnr !== null) return `<span style="color:var(--ok)">Turnaj č. ${tnr} rozpoznán.</span>`;
  if (!url.trim()) return '<span class="muted">Vlož odkaz a objeví se tu potvrzení, že je v pořádku.</span>';
  return '<span style="color:var(--err)">Tohle není odkaz na turnaj na chess-results.com. Čekám adresu, ve které je <code>tnr</code> a číslo.</span>';
}

/**
 * Po vložení odkazu musí panel zareagovat hned, ale překreslit ho celý nejde:
 * uživateli by zmizel kurzor z pole. Proto se upraví jen to, co se odkazem mění.
 */
function syncUrlUi() {
  const tnr = tournamentNumber(addComp.url);
  const hint = $('#urlHint');
  if (hint) hint.innerHTML = urlHint(addComp.url);
  const btn = $('button[data-act="downloadExports"]');
  if (btn) btn.disabled = tnr === null;
  const step1 = $('.step');
  if (step1) {
    step1.classList.toggle('done', tnr !== null);
    const n = $('.n', step1);
    if (n) n.textContent = tnr === null ? '1' : '✓';
  }
  const note = $('#downloadNote');
  if (note) {
    note.innerHTML =
      tnr === null
        ? 'Nejdřív vlož odkaz v kroku 1.'
        : 'Oba se jmenují <code>chessResultsList.xlsx</code>, takže druhý se uloží jako <code>chessResultsList(1).xlsx</code>. Najdeš je mezi staženými soubory.';
  }
}

function addPanel() {
  const tnr = tournamentNumber(addComp.url);
  // průběžná hláška se musí lišit od hotového výsledku, jinak vypadá načítání jako úspěch
  const status = addComp.error
    ? `<ul class="issues"><li class="error">${esc(addComp.error)}</li></ul>`
    : addComp.msg
      ? `<ul class="issues"><li class="${addComp.busy ? 'info' : 'okmsg'}">${esc(addComp.msg)}</li></ul>`
      : '';

  const step = (n, title, done, body) =>
    `<div class="step ${done ? 'done' : ''}">
       <h4><span class="n">${done ? '✓' : n}</span>${title}</h4>
       ${body}
     </div>`;

  return `<div class="card addpanel" data-busy="${addComp.busy ? '1' : '0'}">
    <h3>Přidat soutěž z chess-results</h3>
    <p class="small-text muted">Soutěž se přidá ze dvou souborů, které chess-results nabízí ke stažení.
    Aplikace je stáhne za tebe, ty je jen nahraješ zpátky. Soutěž pak zůstane uložená v tomhle zařízení.</p>

    ${step(1, 'Vlož odkaz na soutěž', tnr !== null, `
      <p class="small-text muted">Otevři soutěž na chess-results.com a zkopíruj adresu z prohlížeče. Je jedno,
      kterou stránku soutěže máš zrovna otevřenou.</p>
      <label class="field"><span>Odkaz na turnaj</span>
        <input type="text" data-add="url" value="${esc(addComp.url)}"
          placeholder="https://chess-results.com/tnr1507857.aspx" autocomplete="off" inputmode="url"></label>
      <p class="small-text" id="urlHint">${urlHint(addComp.url)}</p>
      <div class="grid two" style="margin-top:.5rem">
        <label class="field"><span>Počet šachovnic v utkání</span>
          <input type="text" inputmode="numeric" data-add="boards" value="${esc(addComp.boards)}" placeholder="např. 8" autocomplete="off"></label>
        <label class="field"><span>Zkratka do nabídky (nepovinné)</span>
          <input type="text" data-add="short" value="${esc(addComp.short)}" placeholder="podle názvu soutěže" autocomplete="off"></label>
      </div>`)}

    ${step(2, 'Stáhni dva soubory', addComp.downloaded, `
      <p class="small-text muted">Kliknutím se stáhnou oba soubory, které aplikace potřebuje. Chess-results
      nabízí každý seznam zvlášť, proto jsou dva:</p>
      <ul class="small-text muted" style="margin:.2rem 0 .6rem 1.1rem">
        <li><b>Soupisky družstev</b> (seznam <em>Sestava družstva bez výsledků</em>) – z nich se berou družstva a hráči.</li>
        <li><b>Rozlosování</b> (seznam <em>Los družstev pro všechna kola</em>) – z něj se berou kola a zápasy.</li>
      </ul>
      <div class="row">
        <button class="btn" type="button" data-act="downloadExports" ${tnr === null ? 'disabled' : ''}>
          ${addComp.downloaded ? 'Stáhnout znovu' : 'Stáhnout oba soubory'}</button>
      </div>
      <p class="small-text muted" style="margin-top:.4rem" id="downloadNote">${
        tnr === null
          ? 'Nejdřív vlož odkaz v kroku 1.'
          : 'Oba se jmenují <code>chessResultsList.xlsx</code>, takže druhý se uloží jako <code>chessResultsList(1).xlsx</code>. Najdeš je mezi staženými soubory.'
      }</p>`)}

    ${step(3, 'Nahraj je zpátky', false, `
      <p class="small-text muted">Vyber oba stažené soubory najednou. Na pořadí ani na názvech nezáleží,
      aplikace pozná podle obsahu, co je v kterém.</p>
      <input type="file" accept=".xlsx,.html,.htm" multiple data-act="uploadRoster"
        aria-label="Nahrát stažené soubory se soupiskami a rozlosováním">
      <p class="small-text muted" style="margin-top:.4rem">Stačí i samotné soupisky, pak se jen nevyberou kola
      a družstva zadáš ručně. Rozlosování jde nahrát kdykoli potom, doplní se k vybrané soutěži.</p>`)}

    ${status}

    <details style="margin-top:.6rem">
      <summary>Další možnosti</summary>
      ${
        tnr === null
          ? ''
          : `<p class="small-text muted">Stáhnout po jednom:
             <a href="${esc(exportUrl(tnr, 8))}" target="_blank" rel="noopener">soupisky</a> ·
             <a href="${esc(exportUrl(tnr, 2))}" target="_blank" rel="noopener">rozlosování</a></p>`
      }
      <p class="small-text muted">Místo stažených souborů jde nahrát i uložená stránka (.html) se stejnými seznamy.</p>
      <p class="small-text muted">Soutěž přidaná takhle je jen v tomhle zařízení. Aby ji v aplikaci měli všichni,
      dá se o ni požádat na GitHubu.</p>
      <div class="row">
        <a class="btn small secondary" href="${esc(issueUrl(REPO, addComp))}" target="_blank" rel="noopener">Požádat o přidání pro všechny</a>
      </div>
    </details>
  </div>`;
}

/** Vybraný kraj nemá ve sdílených datech žádnou soutěž (Praha zveřejňuje sezónu až později). */
function regionEmptyNote() {
  const code = settings().region;
  if (!code || !DATA.competitions.length || regionCompCount(DATA.competitions, code) > 0) return '';
  const r = REGIONS.find((x) => x.code === code);
  return `<p class="muted small-text" style="margin-top:.5rem">${esc(r?.name ?? code)}: soutěže této sezóny na chess.cz
    zatím nejsou. Jakmile je svaz zveřejní, objeví se tu samy (data se obnovují každý pátek).
    Do té doby jsou v nabídce celostátní soutěže${feature('addComp') ? ', nebo přidej soutěž z chess-results' : ''}.</p>`;
}

function viewZapas() {
  const c = comp();
  const teams = c?.teams ?? [];
  const rounds = c?.rounds ?? [];
  const round = rounds.find((r) => String(r.no) === String(S.round));

  const compLabel = (x) => {
    const full = `${x.name}${x.group ? ` ${x.group}` : ''}`;
    const short = standardShort(x);
    // zkratka se nepřidává, když je stejná jako název, ať se nabídka nezdvojuje
    const label = short && !full.startsWith(short) ? `${short} – ${full}` : full;
    return `${label}${(x.teams?.length ?? x.teamCount) ? '' : ' (bez soupisek)'}`;
  };
  const opt = (x) => `<option value="${esc(x.id)}" ${x.id === S.compId ? 'selected' : ''}>${esc(compLabel(x))}</option>`;
  // nabídka po skupinách: celostátní, mládež, kraje (můj kraj první), vlastní, ukončené
  const groups = groupCompetitions(DATA.competitions, { region: settings().region ?? '', keep: S.compId });
  // zápis ze soutěže, kterou toto zařízení v datech nemá (z archivu nebo QR kódu)
  const foreign = S.compInfo && !DATA.competitions.some((x) => x.id === S.compId)
    ? `<optgroup label="Soutěž tohoto zápisu">${opt({ ...S.compInfo, id: S.compId })}</optgroup>`
    : '';
  const compOpts =
    foreign + groups.map((g) => `<optgroup label="${esc(g.label)}">${g.comps.map(opt).join('')}</optgroup>`).join('');

  const roundField = rounds.length
    ? `<label class="field"><span>Kolo</span><select data-chg="round"><option value="">— vyber kolo —</option>${rounds
        .map(
          (r) =>
            `<option value="${esc(r.no)}" ${String(r.no) === String(S.round) ? 'selected' : ''}>${esc(r.no)}. kolo${
              r.date ? ` (${esc(L.fmtDate(r.date))})` : ''
            }</option>`,
        )
        .join('')}</select></label>`
    : `<label class="field"><span>Kolo</span><input type="text" inputmode="numeric" data-bind="round" value="${esc(S.round)}" autocomplete="off"></label>`;

  const matchList = round?.matches?.length
    ? `<h3 style="margin-top:1rem">Zápas v ${esc(round.no)}. kole</h3>
       <div class="match-list">${round.matches
         .map(
           (m, i) =>
             `<button type="button" class="match-btn ${
               S.home.team === m.home && S.away.team === m.away ? 'active' : ''
             }" data-act="pickMatch" data-i="${i}" ${
               S.home.team === m.home && S.away.team === m.away ? 'aria-pressed="true"' : ''
             }>${esc(m.home)} <span class="muted">–</span> ${esc(m.away)}</button>`,
         )
         .join('')}</div>`
    : '';

  const teamField = (side, label) => {
    if (!teams.length)
      return `<label class="field"><span>${label}</span><input type="text" data-bind="${side}.team" value="${esc(
        S[side].team,
      )}" autocomplete="off" placeholder="Název družstva"></label>`;
    return `<label class="field"><span>${label}</span><select data-chg="team" data-side="${side}"><option value="">— vyber družstvo —</option>${teams
      .map((t) => `<option ${t.name === S[side].team ? 'selected' : ''}>${esc(t.name)}</option>`)
      .join('')}</select></label>`;
  };

  // Když je vybraný zápas z rozlosování, výběr družstev je jen záloha pro výjimky a schová se.
  const fromDraw = round?.matches?.some((m) => m.home === S.home.team && m.away === S.away.team);
  const teamFields = `<div class="grid two">${teamField('home', 'Domácí družstvo')}${teamField('away', 'Hostující družstvo')}</div>`;
  const teamsCard = round?.matches?.length
    ? `<div class="card">
        <details ${fromDraw || !(S.home.team || S.away.team) ? '' : 'open'}>
          <summary>Zadat družstva ručně (zápas není v rozlosování)</summary>
          <div style="margin-top:.5rem">${teamFields}</div>
        </details>
      </div>`
    : `<div class="card">
        <h2>Družstva</h2>
        ${
          teams.length
            ? ''
            : `<p class="muted small-text">${
                c && !c.local && isLoaded(c)
                  ? 'Svaz soupisky této soutěže zatím nezveřejnil. Jakmile budou na chess.cz, doplní se samy (data se obnovují každý pátek). Do té doby zadej družstva a hráče ručně.'
                  : 'Pro tuto soutěž zatím nejsou soupisky. Názvy družstev a hráče můžeš zadat ručně.'
              }</p>`
        }
        ${teamFields}
      </div>`;

  return `<div class="cols">
    <div class="col">
    <div class="card">
      <h2>Soutěž a kolo</h2>
      ${
        c && !isLoaded(c)
          ? `<ul class="issues"><li class="${compLoadError ? 'error' : 'info'}"><span>${esc(compLoadError || 'Načítám soupisky a rozlosování…')}</span></li></ul>`
          : ''
      }
      <div class="grid two">
        <label class="field"><span>Soutěž</span><select data-chg="comp">${compOpts}</select></label>
        ${roundField}
      </div>
      ${regionEmptyNote()}
      ${
        feature('addComp') || c?.local
          ? `<div class="row" style="margin-top:.6rem">
        ${feature('addComp') ? `<button class="btn small secondary" type="button" data-act="toggleAdd">${addComp.open ? 'Skrýt přidání soutěže' : '+ Přidat soutěž'}</button>` : ''}
        ${c?.local ? `<button class="btn small danger" type="button" data-act="delComp" data-id="${esc(c.id)}">Odebrat tuhle soutěž</button>` : ''}
      </div>`
          : ''
      }
      ${addComp.open && feature('addComp') ? addPanel() : ''}
      ${matchList}
    </div>
    </div>
    <div class="col">
    ${teamsCard}
    <div class="card">
      <h2>Datum a místo</h2>
      <div class="grid two">
        <label class="field"><span>Hráno dne</span><input type="date" data-bind="date" value="${esc(S.date)}"></label>
        <label class="field"><span>Počet šachovnic${
          c ? ` (soutěž má ${c.boards}${c.boardsUnverified ? ', zatím odhad, upřesní se po 1. kole' : ''})` : ''
        }</span>
          <input type="text" inputmode="numeric" data-chg="matchBoards" value="${esc(boards())}" autocomplete="off"></label>
        <label class="field"><span>Hrací místnost</span><input type="text" data-bind="venue" data-venue="1" value="${esc(S.venue)}" autocomplete="off"></label>
      </div>
    </div>
    </div>
    </div>
    <div class="actions"><button class="btn" data-act="go" data-tab="sestavy" type="button">Pokračovat na sestavy →</button></div>`;
}

function sideCounters(side) {
  const n = S[side].lineup.length;
  const b = boards();
  const r = L.restrictedCount(S[side].lineup);
  const nCls = n >= L.minPlayers(b) && n <= b ? 'ok' : n === 0 ? '' : 'err';
  const rCls = r > L.maxRestricted(b) ? 'err' : 'ok';
  return `<div class="counter">
    <span class="chip ${nCls}">Hráčů: ${n} z ${b}</span>
    <span class="chip ${rCls}" title="Hosté, volní hráči a cizinci">H+V+C: ${r} (nejvýše ${L.maxRestricted(b)})</span>
  </div>`;
}

function rosterCard(side, label) {
  const t = teamOf(side);
  const b = boards();
  const lineup = L.sortedLineup(S[side].lineup);
  const full = lineup.length >= b;
  let roster;
  if (!S[side].team) roster = '<p class="muted">Nejdřív vyber družstvo v kroku Zápas.</p>';
  else if (!t?.players?.length) roster = '<p class="muted">Soupiska tohoto družstva není k dispozici. Hráče přidej ručně níže.</p>';
  else
    roster = `<div class="roster" data-side="${side}">${t.players
      .map((p) => {
        const on = lineup.some((x) => x.no === p.no);
        const off = !on && full;
        const badges = (p.types ?? []).map((x) => `<span class="badge ${x === 'K' || x === 'ZK' ? 'k' : ''}">${esc(x)}</span>`).join('');
        return `<div class="pl ${on ? 'sel' : ''} ${off ? 'off' : ''}" data-act="toggle" data-side="${side}" data-no="${p.no}">
          <input type="checkbox" ${on ? 'checked' : ''} ${off ? 'disabled' : ''} tabindex="-1" aria-label="${esc(p.name)}">
          <div class="nm"><span class="no">${p.no}.</span> ${esc(p.name)}${badges}</div>
          <div class="r">${esc(L.ratingSummary(p) || '–')}</div>
        </div>`;
      })
      .join('')}</div>`;

  // kolonky s ratingem podle toho, co je na soupisce: při jediném Elu jen jedna
  const ratings = L.ratingColumns([...(t?.players ?? []), ...lineup]);
  // Sestava se čte, upravuje se jen výjimečně: jméno a Elo jsou text, pole se otevřou tužkou.
  const rows = lineup
    .map((p, i) => {
      const key = `${side}:${p.no}`;
      const editing = editRow === key;
      const edit = editing
        ? `<div class="lu-edit">
            <label class="field"><span>Příjmení, jméno</span><input type="text" data-edit="name" data-side="${side}" data-no="${p.no}" value="${esc(p.name)}" autocomplete="off"></label>
            ${ratings
              .map(
                (r) => `<label class="field rt"><span>${esc(r.label)}</span><input type="text" inputmode="numeric" data-edit="${r.key}" data-side="${side}" data-no="${p.no}" value="${esc(p[r.key] ?? '')}" autocomplete="off"></label>`,
              )
              .join('')}
            <button class="btn small" type="button" data-act="editRow" data-key="${key}">Hotovo</button>
          </div>`
        : '';
      return `<li class="lu-row ${editing ? 'editing' : ''}">
        <span class="b">${i + 1}.</span>
        <span class="nm">${esc(p.name)}${(p.types ?? []).map((x) => `<span class="badge ${x === 'K' || x === 'ZK' ? 'k' : ''}">${esc(x)}</span>`).join('')}</span>
        <span class="r">${esc(ratings.map((r) => p[r.key] ?? '–').join(' / ') || '')}</span>
        ${feature('editPlayers') ? `<button class="icon-btn" type="button" data-act="editRow" data-key="${key}" aria-label="Upravit jméno a Elo" title="Upravit">✎</button>` : '<span></span>'}
        <button class="icon-btn" type="button" data-act="rm" data-side="${side}" data-no="${p.no}" aria-label="Odebrat ze sestavy" title="Odebrat">✕</button>
        ${edit}
      </li>`;
    })
    .join('');

  return `<div class="card">
    <h2>${label}: ${esc(S[side].team || '—')}</h2>
    ${sideCounters(side)}
    ${roster}
    <h3 style="margin-top:1rem">Sestava (šachovnice podle pořadí na soupisce)</h3>
    ${lineup.length ? `<ol class="lineup">${rows}</ol>` : '<p class="muted">Zatím nikdo nevybrán.</p>'}
    ${
      feature('manualPlayer') || !t?.players?.length
        ? `<details>
      <summary>Přidat hráče, který není v soupisce</summary>
      <div class="grid three" data-manual="${side}">
        <label class="field"><span>Pořadí na soupisce</span><input type="text" inputmode="numeric" data-m="no"></label>
        <label class="field"><span>Příjmení, jméno</span><input type="text" data-m="name" autocomplete="off"></label>
        <label class="field"><span>Typ</span><select data-m="type"><option value="">—</option><option>K</option><option>ZK</option><option>H</option><option>V</option><option>C</option></select></label>
        ${ratings
          .map((r) => `<label class="field"><span>${esc(r.label)}</span><input type="text" inputmode="numeric" data-m="${r.key}"></label>`)
          .join('')}
      </div>
      <div class="actions"><button class="btn secondary" type="button" data-act="addManual" data-side="${side}">Přidat do sestavy</button></div>
    </details>`
        : ''
    }
  </div>`;
}

function viewSestavy() {
  return `<div class="cols"><div class="col">${rosterCard('home', 'Domácí')}</div><div class="col">${rosterCard('away', 'Hosté')}</div></div>
    <div class="actions">
      <button class="btn secondary" data-act="go" data-tab="zapas" type="button">← Zpět</button>
      <button class="btn" data-act="go" data-tab="vysledky" type="button">Pokračovat na výsledky →</button>
    </div>`;
}

function viewVysledky() {
  const b = boards();
  const home = L.sortedLineup(S.home.lineup);
  const away = L.sortedLineup(S.away.lineup);
  const t = L.totals(S, b);
  const done = b - t.missing.length;
  const finished = t.missing.length === 0;
  const score = `${L.fmtPoints(t.home)} : ${L.fmtPoints(t.away)}`;
  const lead = t.home > t.away ? 'home' : t.away > t.home ? 'away' : 'draw';

  const rows = [];
  for (let i = 1; i <= b; i++) {
    const hp = home[i - 1];
    const ap = away[i - 1];
    const code = L.boardResult(S, i);
    const white = L.homeIsWhite(i);
    const auto = !hp || !ap;
    const open = openBoard === i;
    const player = (p, white) =>
      `<span class="nm"><span class="dot ${white ? 'w' : 'b'}"></span><span class="t${p ? '' : ' muted'}">${
        p ? esc(p.name) : 'neobsazeno'
      }</span></span><span class="elo">${p ? esc(L.ratingSummary(p) || '–') : '&nbsp;'}</span>`;
    const res = code
      ? `<span class="rchip ${L.RESULTS[code].forfeit ? 'k' : ''} ${code === 'W' || code === 'WK' ? 'h' : code === 'L' || code === 'LK' ? 'a' : 'd'}">${L.RESULTS[code].label}</span>`
      : '<span class="rchip none">–</span>';
    const btn = (c) =>
      `<button type="button" data-act="res" data-b="${i}" data-c="${c}" class="${code === c ? 'on' : ''}">${L.RESULTS[c].label}</button>`;
    rows.push(`<li class="brow ${code ? 'set' : 'unset'} ${open ? 'open' : ''}">
      <div class="bmain" ${auto ? '' : `data-act="openBoard" data-b="${i}"`} ${auto ? '' : 'role="button" tabindex="0"'}>
        <span class="bno">${i}</span>
        <span class="side h">${player(hp, white)}</span>
        ${res}
        <span class="side a">${player(ap, !white)}</span>
      </div>
      ${
        auto
          ? `<div class="bauto">Neobsazená šachovnice, kontumace ${L.RESULTS[code].label}</div>`
          : open
            ? `<div class="bpick">
                 <div class="res">${['W', 'D', 'L'].map(btn).join('')}</div>
                 <div class="res k">${['WK', 'XK', 'LK'].map(btn).join('')}</div>
                 ${code ? `<button class="btn small ghost" type="button" data-act="res" data-b="${i}" data-c="">Smazat výsledek</button>` : ''}
               </div>`
            : ''
      }
    </li>`);
  }

  return `<div class="card board-head">
      ${feature('fullscreen') ? `<button class="btn small secondary fs-btn" data-act="fullscreen" data-mode="prubeh" type="button"
        title="Průběh utkání na celou obrazovku">⛶ Celá obrazovka</button>` : ''}
      <div class="score-line">
        <div class="tname h">${esc(S.home.team || 'Domácí')}</div>
        <div class="score ${lead}">${score}</div>
        <div class="tname a">${esc(S.away.team || 'Hosté')}</div>
      </div>
      <div class="score-note">${
        finished
          ? `<b>Konečný stav.</b> ${lead === 'draw' ? 'Remíza.' : `Vyhrálo družstvo ${esc(lead === 'home' ? S.home.team : S.away.team)}.`}`
          : `Průběžný stav, rozhodnuto ${done} z ${b} šachovnic${t.missing.length <= 4 ? `, zbývá ${t.missing.join(', ')}` : ''}.`
      }</div>
    </div>
    <ol class="boards">${rows.join('')}</ol>
    <p class="small-text muted">Klepnutím na šachovnici zadáš výsledek. <span class="dot w"></span> bílé,
    <span class="dot b"></span> černé: domácí hrají bílými na lichých šachovnicích. K je kontumace a počítá se jako plný bod.</p>
    <div class="actions">
      <button class="btn secondary" data-act="go" data-tab="sestavy" type="button">← Zpět</button>
      ${feature('fullscreen') ? '<button class="btn secondary" data-act="fullscreen" data-mode="prubeh" type="button">⛶ Celá obrazovka</button>' : ''}
      <button class="btn" data-act="go" data-tab="zaver" type="button">Pokračovat na závěr →</button>
    </div>`;
}

function namesList(side) {
  return (teamOf(side)?.players ?? []).map((p) => `<option value="${esc(p.name)}">`).join('');
}

/** Výběr rozhodčího ze soupisek obou družstev. Jméno jde vždy i napsat ručně. */
function refPicker() {
  const group = (side, label) => {
    const players = teamOf(side)?.players ?? [];
    if (!players.length) return '';
    return `<optgroup label="${esc(label)}: ${esc(S[side].team)}">${players
      .map((p) => `<option value="${esc(p.name)}" ${p.name === S.referee.name ? 'selected' : ''}>${esc(p.no)}. ${esc(p.name)}</option>`)
      .join('')}</optgroup>`;
  };
  const opts = group('home', 'Domácí') + group('away', 'Hosté');
  if (!opts) return '';
  return `<label class="field" style="margin-top:.8rem"><span>Nebo vyber ze soupisky</span>
    <select data-chg="refPick"><option value="">— vyber hráče —</option>${opts}</select></label>`;
}

function viewZaver() {
  const refList = store.recentReferees().map((n) => `<option value="${esc(n)}">`).join('');
  const role = (v, l) => `<option value="${v}" ${S.referee.role === v ? 'selected' : ''}>${l}</option>`;
  const sigBox = (key, title, name) => `<div class="sig"><div class="cap">${title}${name ? `: ${esc(name)}` : ''}</div>
      <canvas data-sig="${key}" aria-label="Podpis: ${esc(title)}"></canvas>
      <div class="row end"><button class="btn small ghost" type="button" data-act="clearSig" data-key="${key}">Smazat podpis</button></div></div>`;
  return `<div class="cols">
    <div class="col">
    <div class="card">
      <h2>Rozhodčí</h2>
      <div class="grid two">
        <label class="field"><span>Funkce</span><select data-chg="refRole">${role('delegated', 'Delegovaný rozhodčí')}${role('substitute', 'Náhradní rozhodčí')}${role('captain', 'Kapitán domácího družstva')}${role('player', 'Hráč ze soupisky')}</select></label>
        <label class="field"><span>Jméno a příjmení rozhodčího</span><input type="text" list="dl-ref" data-bind="referee.name" value="${esc(S.referee.name)}" autocomplete="off"></label>
      </div>
      ${refPicker()}
      <datalist id="dl-ref">${refList}${namesList('home')}${namesList('away')}</datalist>
    </div>
    </div>
    <div class="col">
    <div class="card">
      <h2>Kapitáni</h2>
      <div class="grid two">
        <label class="field"><span>Kapitán domácích${S.home.team ? ` (${esc(S.home.team)})` : ''}</span><input type="text" list="dl-home" data-bind="home.captain" value="${esc(S.home.captain)}" autocomplete="off"></label>
        <label class="field"><span>Kapitán hostů${S.away.team ? ` (${esc(S.away.team)})` : ''}</span><input type="text" list="dl-away" data-bind="away.captain" value="${esc(S.away.captain)}" autocomplete="off"></label>
      </div>
      <datalist id="dl-home">${namesList('home')}</datalist><datalist id="dl-away">${namesList('away')}</datalist>
      <p class="muted small-text">V nižších soutěžích bývá kapitánem někdo z domácích, ve vyšších bývá delegován. Jméno můžeš vybrat ze soupisky nebo napsat.</p>
    </div>
    </div>
    </div>
    <div class="card">
      <h2>Záznam rozhodčího</h2>
      <p class="muted small-text">Průběh utkání, případné přestupky či spory, námitky kapitánů.${feature('notePresets') ? ' Rychlé vložení:' : ''}</p>
      ${feature('notePresets') ? `<div class="presets">${NOTE_PRESETS.map(([l], i) => `<button class="btn small ghost" type="button" data-act="preset" data-i="${i}">${esc(l)}</button>`).join('')}</div>` : ''}
      <textarea data-bind="notes" id="notes" placeholder="Bez zápisu = prázdné pole">${esc(S.notes)}</textarea>
    </div>
    <div class="card">
      <h2>Podpisy</h2>
      <p class="muted small-text">${
        uiMode() === 'desktop' ? 'Podepiš myší nebo perem tabletu.' : 'Podepiš prstem nebo perem na displeji.'
      } Správnost zápisu potvrzují oba kapitáni a rozhodčí.</p>
      ${canvasReadable() ? '' : `<ul class="issues"><li class="error"><span>${esc(CANVAS_BLOCKED)}</span></li></ul>`}
      ${
        feature('qrSign')
          ? uiMode() === 'desktop'
            ? `<div class="qr-hint">
                <div><b>Podepsat na telefonu</b>
                <span class="muted small-text">Myší se podepisuje špatně. Ukaž QR kód, načti ho telefonem a zápis se v něm otevře.
                Podepíšete ho prstem a z telefonu ho odešlete.</span></div>
                <button class="btn" type="button" data-act="qrSign">📱 Podepsat na telefonu</button>
              </div>`
            : `<div class="row" style="margin:.2rem 0 .6rem"><button class="btn small secondary" type="button" data-act="qrSign">📱 Podepsat na jiném zařízení (QR kód)</button></div>`
          : ''
      }
      <div class="sigs">
        ${sigBox('home', 'Kapitán domácího družstva', S.home.captain)}
        ${sigBox('ref', 'Rozhodčí', S.referee.name)}
        ${sigBox('away', 'Kapitán hostujícího družstva', S.away.captain)}
      </div>
    </div>
    <div class="actions">
      <button class="btn secondary" data-act="go" data-tab="vysledky" type="button">← Zpět</button>
      <button class="btn" data-act="go" data-tab="vystup" type="button">Pokračovat na výstup →</button>
    </div>`;
}

// ---------- loga ----------
const SVAZ_LOGO = 'img/logo-sscr.png';

/** Obrázky log, které má zařízení k dispozici (zapnutá nebo ne). */
function logoImages() {
  return {
    svaz: SVAZ_LOGO,
    kraj: store.krajLogo(),
    home: store.teamLogo(S.home.team),
    away: store.teamLogo(S.away.team),
  };
}

/** Loga, která jdou do zápisu: zapnutá a s obrázkem. */
const currentLogos = () => (feature('logos') ? L.activeLogos(S, logoImages()) : {});

function logosCard() {
  const flags = L.logoFlags(S);
  const img = logoImages();
  const row = (slot, title, sub, { canUpload = true } = {}) => {
    const has = !!img[slot];
    const on = flags[slot] && has;
    return `<div class="logo-row ${on ? 'on' : ''}">
      <label class="logo-check">
        <input type="checkbox" data-chg="logo" data-slot="${slot}" ${on ? 'checked' : ''} ${has ? '' : 'disabled'}>
        <span><b>${esc(title)}</b>${sub ? `<span class="muted small-text">${esc(sub)}</span>` : ''}</span>
      </label>
      <span class="logo-thumb">${has ? `<img src="${esc(img[slot])}" alt="">` : '<span class="muted small-text">bez loga</span>'}</span>
      ${
        canUpload
          ? `<span class="logo-btns">
              <label class="btn small secondary">${has ? 'Změnit' : 'Nahrát'}
                <input type="file" accept="image/*" hidden data-act="logoUpload" data-slot="${slot}"></label>
              ${has ? `<button class="btn small ghost" type="button" data-act="logoRemove" data-slot="${slot}" aria-label="Odebrat logo">✕</button>` : ''}
            </span>`
          : '<span class="logo-btns"></span>'
      }
    </div>`;
  };
  return `<div class="card">
    <h2>Loga v zápisu</h2>
    <p class="muted small-text">Zaškrtnutá loga se vykreslí do zápisu. Logo krajského svazu a loga družstev si zařízení pamatuje, příště se doplní samo.</p>
    <div class="logos">
      ${row('svaz', 'Šachový svaz ČR', '', { canUpload: false })}
      ${row('kraj', 'Krajský svaz', '')}
      ${row('home', 'Domácí', S.home.team)}
      ${row('away', 'Hosté', S.away.team)}
    </div>
  </div>`;
}

/** Zmenší nahraný obrázek na nejvýš 400 px a vrátí ho jako data URL (PNG kvůli průhlednosti). */
async function fileToLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await env.loadImage(url);
    const max = 400;
    const k = Math.min(1, max / Math.max(img.width || max, img.height || max));
    const w = Math.max(1, Math.round((img.width || max) * k));
    const h = Math.max(1, Math.round((img.height || max) * k));
    const c = env.createCanvas(w, h);
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function saveLogo(slot, dataUrl) {
  if (slot === 'kraj') return store.setKrajLogo(dataUrl);
  if (slot === 'home' || slot === 'away') return store.setTeamLogo(S[slot].team, dataUrl);
  return false;
}

function mailCard() {
  const to = store.mailFor(S.compId);
  return `<div class="card">
    <h2>Odeslat e-mailem</h2>
    <label class="field"><span>Komu (např. řídicí soutěže)</span>
      <input type="email" id="mailTo" value="${esc(to)}" placeholder="adresa@example.cz" autocomplete="email" inputmode="email"></label>
    <div class="actions" style="margin-top:.6rem">
      <button class="btn" type="button" data-act="mail">Odeslat zápis e-mailem</button>
    </div>
    <p class="muted small-text" style="margin-top:.4rem">${
      prefersShare()
        ? 'Otevře se nabídka sdílení se zápisem v PDF. Vyber poštovní aplikaci, adresu příjemce aplikace zkopíruje, stačí ji vložit.'
        : 'Zápis se stáhne jako PDF a otevře se poštovní program s vyplněným předmětem a textem. Stažený soubor do e-mailu přilož.'
    } Adresa se pro tuto soutěž zapamatuje.</p>
  </div>`;
}

function viewVystup() {
  const issues = L.validate(S, comp(), { forFinal: true });
  if (!canvasReadable()) issues.unshift({ level: 'error', text: CANVAS_BLOCKED });
  const tabName = Object.fromEntries(TABS);
  const item = (i) =>
    `<li class="${i.level}"><span>${esc(i.text)}</span>${
      i.tab ? `<button class="fix" type="button" data-act="go" data-tab="${i.tab}">${esc(tabName[i.tab])} →</button>` : ''
    }</li>`;
  const group = (level, title) => {
    const xs = issues.filter((i) => i.level === level);
    return xs.length ? `<h3 class="issues-h">${title}</h3><ul class="issues">${xs.map(item).join('')}</ul>` : '';
  };
  const list = issues.length
    ? `${group('error', 'Nutné opravit')}${group('warn', 'Doporučujeme doplnit')}`
    : '<ul class="issues"><li class="okmsg">Zápis je v pořádku a podle soutěžního řádu úplný.</li></ul>';
  return `<div class="vystup">
    <div class="vystup-side">
    <div class="card">
      <h2>Kontrola zápisu</h2>
      ${list}
      <div class="actions" style="margin-top:0">
        <button class="btn" type="button" data-act="pdf">Stáhnout PDF</button>
        ${feature('png') ? '<button class="btn" type="button" data-act="png">Stáhnout obrázek (PNG)</button>' : ''}
        ${feature('share') ? '<button class="btn secondary" type="button" data-act="share" id="btnShare">Sdílet</button>' : ''}
      </div>
    </div>
    ${feature('logos') ? logosCard() : ''}
    ${feature('mail') ? mailCard() : ''}
    <div class="card vystup-done">
      <h2>Dokončení</h2>
      <p class="muted small-text">Uloží zápis do archivu v tomto zařízení (potřebné uchovat nejméně 6 měsíců, čl. 2.4.6) a otevře nový zápis.</p>
      <div class="actions" style="margin-top:.4rem">
        <button class="btn secondary" data-act="go" data-tab="zaver" type="button">← Zpět</button>
        <button class="btn" type="button" data-act="archive">Uložit do archivu a začít nový</button>
      </div>
    </div>
    </div>
    <div class="card vystup-preview">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Náhled</h2>
        ${feature('fullscreen') ? '<button class="btn small secondary" type="button" data-act="fullscreen" data-mode="zapis">⛶ Celá obrazovka</button>' : ''}
      </div>
      <div class="preview ${feature('fullscreen') ? 'zoomable' : ''}" id="preview" ${feature('fullscreen') ? 'data-act="fullscreen" data-mode="zapis" title="Klepnutím zobrazíš na celou obrazovku"' : ''}>
        <p class="muted">Vykresluji…</p></div>
    </div>
  </div>`;
}

/** Tlačítko zpět na zápis na stránkách z menu. */
const backBar = () =>
  `<div class="page-back"><button class="btn small secondary" type="button" data-act="go" data-tab="${lastStep}">← Zpět k zápisu</button></div>`;

const archComp = (m) => DATA.competitions.find((x) => x.id === m.compId) ?? m.compInfo;

function viewArchiv() {
  const list = store.loadArchive();
  const months = retentionMonths();
  const old = olderThan(list, months);
  const items = list
    .map((m) => {
      const c = archComp(m);
      const t = L.totals(m, L.matchBoards(m, c));
      const score = t.missing.length ? '' : ` · ${L.fmtPoints(t.home)} : ${L.fmtPoints(t.away)}`;
      return `<div class="it">
        <div><b>${esc(m.home.team)} – ${esc(m.away.team)}${score}</b>
        <span class="muted small-text">${esc(L.fmtDate(m.date))} · ${esc(c?.short || c?.name || m.compId)}${m.round ? ` · ${esc(m.round)}. kolo` : ''}</span></div>
        <div class="row"><button class="btn small" type="button" data-act="openArch" data-id="${esc(m.id)}">Otevřít</button>
        <button class="btn small secondary" type="button" data-act="exportOne" data-id="${esc(m.id)}">Uložit do souboru</button>
        <button class="btn small danger" type="button" data-act="delArch" data-id="${esc(m.id)}">Smazat</button></div>
      </div>`;
    })
    .join('');
  return `${backBar()}
  <div class="card">
    <h2>Archiv zápisů${list.length ? ` (${list.length})` : ''}</h2>
    <p class="muted small-text">Archiv je jen v tomto zařízení a vymazáním dat prohlížeče zmizí. Vlastní archiv si vedeš tak,
    že si zápisy stáhneš do souboru a uložíš si ho, kam chceš (počítač, cloudový disk). Soubor jde kdykoli nahrát zpátky,
    i na jiném zařízení. Zápisy se sloučí bez duplicit.</p>
    <div class="actions" style="margin-top:.4rem">
      <button class="btn" type="button" data-act="exportArch" ${list.length ? '' : 'disabled'}>Stáhnout zálohu všech zápisů</button>
      <label class="btn secondary file-btn">Nahrát ze souboru
        <input type="file" accept=".json,application/json" multiple hidden data-act="importArch"></label>
    </div>
  </div>
  ${
    old.length
      ? `<ul class="issues"><li class="warn"><span>${old.length === 1 ? '1 zápis je starší' : `${old.length} zápisů je starších`} než ${months} měsíců.
         Pokud ho už nepotřebuješ, smaž ho. Předtím si můžeš stáhnout zálohu.</span>
         <button class="fix" type="button" data-act="delOld">Smazat staré</button></li></ul>`
      : ''
  }
  <div class="card">${list.length ? `<div class="arch">${items}</div>` : '<p class="muted">Zatím tu nejsou žádné uložené zápisy.</p>'}</div>`;
}

function viewNastaveni() {
  const pref = store.uiPref();
  const uiOpt = (v, label) =>
    `<label class="set-radio"><input type="radio" name="ui" data-chg="uiPref" value="${v}" ${
      (pref === v || (v === 'auto' && pref !== 'desktop' && pref !== 'touch')) ? 'checked' : ''
    }><span>${label}</span></label>`;
  const featureRows = FEATURES.map(
    ([key, label, desc]) => `<label class="set-row">
      <span><b>${esc(label)}</b><span class="muted small-text">${esc(desc)}</span></span>
      <input type="checkbox" class="switch" data-chg="feature" data-key="${key}" ${feature(key) ? 'checked' : ''}>
    </label>`,
  ).join('');
  const months = retentionMonths();
  return `${backBar()}
  <div class="card">
    <h2>Nastavení</h2>
    <p class="muted small-text">Nastavení platí pro toto zařízení.</p>
    <h3 style="margin-top:.8rem">Zobrazení</h3>
    <div class="set-radios">
      ${uiOpt('auto', `Automaticky <span class="muted">(teď ${esc(UI_NAMES[detectUi()])})</span>`)}
      ${uiOpt('desktop', '🖥 Počítač')}
      ${uiOpt('touch', '📱 Tablet a mobil')}
    </div>
  </div>
  <div class="card">
    <h3>Soutěže</h3>
    <label class="field"><span>Můj kraj</span>
      <select data-chg="region">
        <option value="">Všechny kraje</option>
        ${REGIONS.filter((r) => r.code !== 'CR')
          .map((r) => `<option value="${r.code}" ${settings().region === r.code ? 'selected' : ''}>${esc(r.name)} (${esc(r.abbr)})</option>`)
          .join('')}
      </select></label>
    ${regionEmptyNote()}
    <p class="muted small-text">S vybraným krajem nabídka soutěží ukáže jen celostátní soutěže a soutěže tvého kraje.
    Soutěže, jejichž poslední kolo bylo před víc než měsícem, jsou v nabídce dole mezi ukončenými.</p>
  </div>
  <div class="card">
    <h3>Funkce</h3>
    <p class="muted small-text">Co nepotřebuješ, vypni a zápis bude jednodušší. Vypnutím se nic nesmaže, funkci jde kdykoli zase zapnout.</p>
    <div class="set-list">${featureRows}</div>
  </div>
  <div class="card">
    <h3>Archiv</h3>
    <label class="field"><span>Upozornit na zápisy starší než</span>
      <select data-chg="retention">${RETENTION.map(
        (m) => `<option value="${m}" ${m === months ? 'selected' : ''}>${m ? `${m} měsíců` : 'neupozorňovat'}</option>`,
      ).join('')}</select></label>
    <p class="muted small-text">Soutěžní řád žádá archivovat zápis nejméně 6 měsíců (čl. 2.4.6).</p>
  </div>
  <div class="card">
    <h3>Data v tomto zařízení</h3>
    <p class="muted small-text">Smaže rozpracovaný zápis, archiv, loga, zapamatované údaje i nastavení. Nejdřív si stáhni zálohu archivu.</p>
    <div class="actions" style="margin-top:.4rem">
      <button class="btn secondary" type="button" data-act="exportArch">Stáhnout zálohu archivu</button>
      <button class="btn danger" type="button" data-act="clearAll">Smazat všechna data</button>
    </div>
  </div>`;
}

const viewNapoveda = () => `${backBar()}${helpPage()}`;
const viewSoukromi = () => `${backBar()}${privacyPage()}`;

const VIEWS = {
  zapas: viewZapas,
  sestavy: viewSestavy,
  vysledky: viewVysledky,
  zaver: viewZaver,
  vystup: viewVystup,
  archiv: viewArchiv,
  nastaveni: viewNastaveni,
  napoveda: viewNapoveda,
  soukromi: viewSoukromi,
};
const isStep = (id) => TABS.some(([t]) => t === id);
let lastStep = 'zapas';

// ---------- vykreslení ----------
function renderSteps() {
  const items = TABS.map(
    ([id, label], i) => `<button type="button" data-act="go" data-tab="${id}" class="${tab === id ? 'active' : ''}" ${tab === id ? 'aria-current="step"' : ''}><span class="n">${i + 1}</span>${label}</button>`,
  ).join('');
  stepsEl.innerHTML = items;
  $$('#appMenu [data-menu]').forEach((b) => b.classList.toggle('cur', b.dataset.menu === tab));
  stepsEl.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderView({ keepScroll = true } = {}) {
  const saved = {};
  $$('.roster').forEach((r) => (saved[r.dataset.side] = r.scrollTop));
  const y = window.scrollY;
  view.innerHTML = (VIEWS[tab] ?? viewZapas)();
  // vybraná soutěž bez soupisek: dotáhnout a překreslit
  const cur = DATA.competitions.find((x) => x.id === S.compId);
  if (cur && !isLoaded(cur) && compLoading !== cur.id && compFailed !== cur.id) {
    compLoading = cur.id;
    loadCompData(cur.id).finally(() => {
      compLoading = null;
      renderView();
    });
  }
  view.classList.toggle('wide', tab === 'vystup' || (uiMode() === 'desktop' && isStep(tab) && tab !== 'vysledky'));
  if (keepScroll) {
    $$('.roster').forEach((r) => (r.scrollTop = saved[r.dataset.side] ?? 0));
    window.scrollTo(0, y);
  } else window.scrollTo(0, 0);
  afterRender();
}

function renderAll(opts) {
  renderSteps();
  renderView(opts);
}

function goTo(id) {
  tab = id;
  if (isStep(id)) {
    lastStep = id;
    rememberTab(id);
  }
  renderAll({ keepScroll: false });
}

// plátna podpisů hlídají svou velikost (otočení tabletu, změna okna, přeskládání stránky)
const padObserver =
  typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => entries.forEach((e) => sizePad(e.target, e.target.dataset.sig)))
    : null;

function afterRender() {
  padObserver?.disconnect();
  $$('canvas[data-sig]').forEach((c) => {
    initPad(c, c.dataset.sig);
    padObserver?.observe(c);
  });
  if (tab === 'vystup') renderPreview();
  const share = $('#btnShare');
  if (share && !navigator.share) share.style.display = 'none';
}

// ---------- podpisy ----------
/**
 * Nastaví plátnu podpisu rozlišení podle jeho velikosti na obrazovce a nakreslí do něj uložený podpis.
 * Volá se při vykreslení kroku a znovu, když se plátno změní (otočení tabletu, změna okna):
 * jinak by se obrázek roztáhl a čára by se nekreslila pod prstem.
 */
function sizePad(canvas, key) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width === w && canvas.height === h && canvas.dataset.sized) return;
  canvas.dataset.sized = '1';
  canvas.width = w; // změna rozměru plátno vymaže a vrátí nastavení kreslení
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b2a6f';
  const src = S.sig?.[key];
  if (!src) return;
  const img = new Image();
  img.onload = () => {
    // plátno se mezitím mohlo znovu změnit nebo podpis smazat
    if (canvas.width !== w || canvas.height !== h || S.sig?.[key] !== src) return;
    // podpis z plátna jiného tvaru se zmenší tak, aby se vešel, a nedeformuje se
    const k = Math.min(rect.width / img.width, rect.height / img.height);
    const dw = img.width * k;
    const dh = img.height * k;
    ctx.drawImage(img, (rect.width - dw) / 2, (rect.height - dh) / 2, dw, dh);
  };
  img.src = src;
}

/**
 * Podpis jako PNG v rozumném rozlišení. Plátno má rozlišení displeje (telefon až 3×), ale pro zápis v PDF
 * stačí dvojnásobek velikosti na obrazovce; menší obrázek šetří úložiště zařízení, archiv i odkaz.
 */
const SIG_SCALE = 2;
const SIG_MAX_W = 800;
function sigDataUrl(canvas) {
  const cssW = canvas.getBoundingClientRect().width || canvas.width;
  const k = Math.min(1, (SIG_SCALE * cssW) / canvas.width, SIG_MAX_W / canvas.width);
  if (k >= 0.99) return canvas.toDataURL('image/png');
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * k));
  out.height = Math.max(1, Math.round(canvas.height * k));
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

function initPad(canvas, key) {
  sizePad(canvas, key);
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let last = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    last = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x + 0.01, last.y + 0.01);
    ctx.stroke();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    S.sig[key] = sigDataUrl(canvas);
    save();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

// ---------- podpis na telefonu: zápis se přenese QR kódem ----------
/** Nakreslí QR kód do plátna; vrací plátno, nebo null, když se data do QR nevejdou. */
function qrCanvas(text, cssSize) {
  const make = (level) => {
    const qr = qrcode(0, level);
    qr.addData(text, 'Byte');
    qr.make();
    return qr;
  };
  let q;
  try {
    // z displeje je obraz čistý, nižší oprava chyb (L) dá řidší a lépe čitelný kód;
    // verzi 23 se vyhýbáme: čtečka jsQR (používají ji některé webové čtečky) má pro ni chybnou
    // polohu zarovnávacích značek a při úrovni L kód nepřečte
    q = make('L');
    if (q.getModuleCount() === 23 * 4 + 17) q = make('M');
  } catch {
    return null;
  }
  const n = q.getModuleCount();
  const quiet = 4;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cell = Math.max(2, Math.floor((cssSize * dpr) / (n + 2 * quiet)));
  const size = cell * (n + 2 * quiet);
  const c = env.createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) ctx.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
  c.style.width = `${size / dpr}px`;
  c.style.height = `${size / dpr}px`;
  return c;
}

function closeModal() {
  $('.modal')?.remove();
}

async function showQr() {
  if (typeof CompressionStream === 'undefined') return toast('Tento prohlížeč QR kód nevytvoří, zkus jiný.');
  const issues = L.validate(S, comp()).filter((i) => i.level === 'error' && i.tab !== 'zaver');
  const base = `${location.origin}${location.pathname}`;
  // soutěž ze sdílených dat jde krátce (telefon má stejné soupisky), jinak celý zápis
  const shared = DATA.competitions.find((c) => c.id === S.compId && !c.local);
  const url = await encodeLink(S, { comp: shared, boards: boards(), compInfo: compSnapshot() }, base);
  const size = Math.min(520, window.innerWidth - 64, window.innerHeight - 260);
  const canvas = qrCanvas(url, Math.max(260, size));
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-label="Podepsat na telefonu">
      <h2>Podepsat na telefonu</h2>
      <div class="qr-wrap"></div>
      <ol class="small-text">
        <li>Na telefonu otevři fotoaparát a namiř ho na QR kód. Klepni na odkaz, který se objeví.</li>
        <li>Zápis se v telefonu otevře rovnou u podpisů. Oba kapitáni a rozhodčí se podepíšou prstem.</li>
        <li>Z telefonu zápis odešli (Výstup → Odeslat e-mailem) a ulož do archivu.</li>
      </ol>
      ${
        issues.length
          ? `<ul class="issues"><li class="warn"><span>Zápis ještě není kompletní (${esc(issues[0].text)}). Telefon dostane zápis tak, jak je teď.</span></li></ul>`
          : ''
      }
      <p class="muted small-text">QR kód obsahuje zápis tak, jak je teď. Co na tomto zařízení změníš potom, telefon neuvidí,
      v tom případě ukaž nový QR kód. Data jdou přímo do telefonu, ne přes internet.</p>
      <div class="actions"><button class="btn" type="button" data-close>Zavřít</button></div>
    </div>`;
  if (canvas) $('.qr-wrap', m).append(canvas);
  else $('.qr-wrap', m).innerHTML = '<p class="muted">Zápis je na QR kód příliš dlouhý. Zkrať záznam rozhodčího a zkus to znovu.</p>';
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.closest('[data-close]')) closeModal();
  });
  document.body.append(m);
  $('[data-close]', m).focus();
}

/** Zápis z odkazu (QR kódu): otevře se u podpisů. Volá se při spuštění a při změně # v adrese. */
async function openFromLink() {
  if (!hasLink(location.hash)) return false;
  const hash = location.hash;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  let m;
  const prepare = (id) => ensureComp(DATA, id);
  try {
    m = await decodeLink(hash, { competitions: DATA.competitions, prepare });
  } catch (e) {
    if (e.code !== 'roster') {
      alert(e.message);
      return false;
    }
    // soupisky se liší: nejdřív zkusit stáhnout aktuální, pak teprve ohlásit chybu
    try {
      DATA = await refreshData();
      $('#dataStatus').textContent = dataSummary(DATA);
      m = await decodeLink(hash, { competitions: DATA.competitions, prepare: (id) => ensureComp(DATA, id, { fresh: true }) });
    } catch (e2) {
      alert(e2.code === 'roster' || !e2.message ? e.message : e2.message);
      return false;
    }
  }
  const started = S.home.team || S.away.team || S.home.lineup.length || S.away.lineup.length;
  const inArchive = store.loadArchive().some((x) => x.id === S.id);
  const signed = S.sig?.home || S.sig?.ref || S.sig?.away;
  if (S.id === m.id) {
    if (signed && !confirm('Tento zápis už v zařízení je i s podpisy. Nahradit ho verzí z QR kódu? Podpisy se smažou.')) return false;
  } else if (started && !inArchive && !confirm('Otevřít zápis z QR kódu? Rozpracovaný zápis v tomto zařízení není v archivu a zahodí se.')) {
    return false;
  }
  S = m;
  save();
  tab = 'zaver';
  lastStep = 'zaver';
  rememberTab('zaver');
  toast('Zápis je načtený z QR kódu. Podepište ho a odešlete.');
  return true;
}

// ---------- celá obrazovka: zápis k prohlížení nebo průběh utkání ----------
// Na tabletu u stolu se dá přepnout na velký přehled, který je čitelný i z dálky.
const overlay = $('#overlay');
let overlayMode = null;
let overlayZoom = false;

function prubehHtml() {
  const b = boards();
  const home = L.sortedLineup(S.home.lineup);
  const away = L.sortedLineup(S.away.lineup);
  const t = L.totals(S, b);
  const lead = t.home > t.away ? 'home' : t.away > t.home ? 'away' : 'draw';
  const rows = [];
  for (let i = 1; i <= b; i++) {
    const code = L.boardResult(S, i);
    const white = L.homeIsWhite(i);
    // Rozložení jako na papírovém zápisu: šachovnice, pořadí na soupisce, jméno, výsledek a zrcadlově hosté.
    const nm = (p, w, side) => {
      const elo = p ? L.ratingSummary(p) : '';
      return `<span class="pl-side ${side}"><span class="nm"><span class="dot ${w ? 'w' : 'b'}"></span><span class="t${
        p ? '' : ' muted'
      }">${p ? esc(p.name) : 'neobsazeno'}</span></span>${
        elo ? `<span class="sub">${esc(/^\d+$/.test(elo) ? `Elo ${elo}` : elo)}</span>` : ''
      }</span>`;
    };
    const rno = (p) => `<span class="rno" ${p ? 'title="Pořadí na soupisce"' : ''}>${p ? esc(p.no) : ''}</span>`;
    const hp = home[i - 1];
    const ap = away[i - 1];
    const cls = !code ? 'none' : L.RESULTS[code].forfeit ? 'k' : code === 'W' || code === 'WK' ? 'h' : code === 'L' || code === 'LK' ? 'a' : 'd';
    rows.push(`<li><span class="bno">${i}</span>${rno(hp)}${nm(hp, white, 'h')}<span class="rchip ${cls}">${
      code ? L.RESULTS[code].label : '–'
    }</span>${nm(ap, !white, 'a')}${rno(ap)}<span class="bno r">${i}</span></li>`);
  }
  const comp_ = comp();
  return `<div class="pr">
    <div class="pr-meta">${esc(comp_?.short ?? '')}${S.round ? ` · ${esc(S.round)}. kolo` : ''}${S.date ? ` · ${esc(L.fmtDate(S.date))}` : ''}</div>
    <div class="pr-head">
      <div class="tname">${esc(S.home.team || 'Domácí')}</div>
      <div class="score ${lead}">${L.fmtPoints(t.home)} : ${L.fmtPoints(t.away)}</div>
      <div class="tname a">${esc(S.away.team || 'Hosté')}</div>
    </div>
    <div class="pr-note">${t.missing.length ? `Hraje se, rozhodnuto ${b - t.missing.length} z ${b}` : 'Konečný stav'}</div>
    <ol class="pr-boards">${rows.join('')}</ol>
  </div>`;
}

/**
 * Elo je za jménem, jen když se tam vejde u všech hráčů. Jakmile se u jednoho zalomí,
 * dá se pod jméno všem, aby přehled vypadal jednotně.
 */
function fitPrubeh() {
  const pr = $('.pr', overlay);
  if (!pr) return;
  pr.classList.toggle('stacked', false);
  const wrapped = $$('.pl-side', pr).some((side) => {
    const nm = $('.nm', side);
    const sub = $('.sub', side);
    if (!nm || !sub) return false;
    return sub.getBoundingClientRect().top >= nm.getBoundingClientRect().bottom - 2;
  });
  pr.classList.toggle('stacked', wrapped);
}

async function renderOverlay() {
  const mode = overlayMode;
  overlay.innerHTML = `<div class="ov-bar">
      <div class="seg" role="tablist">
        <button type="button" data-ov="prubeh" class="${mode === 'prubeh' ? 'on' : ''}">Průběh utkání</button>
        <button type="button" data-ov="zapis" class="${mode === 'zapis' ? 'on' : ''}">Zápis</button>
      </div>
      ${mode === 'zapis' ? `<button type="button" class="btn small ghost" data-ov="zoom">${overlayZoom ? 'Na šířku' : 'Celá stránka'}</button>` : ''}
      <button type="button" class="btn small" data-ov="close">Zavřít ✕</button>
    </div>
    <div class="ov-body ${mode} ${overlayZoom ? 'page' : ''}">${mode === 'prubeh' ? prubehHtml() : '<p class="muted">Vykresluji…</p>'}</div>`;
  if (mode === 'prubeh') fitPrubeh();
  if (mode === 'zapis') {
    const pages = await renderPages(S, comp(), env, { scale: 2, logos: currentLogos() });
    const body = $('.ov-body', overlay);
    if (overlayMode === 'zapis' && body) body.replaceChildren(...pages);
  }
}

function openOverlay(mode) {
  overlayMode = mode === 'zapis' ? 'zapis' : 'prubeh';
  overlayZoom = false;
  overlay.hidden = false;
  document.body.classList.add('ov-open');
  renderOverlay();
  // skutečná celá obrazovka tam, kde ji prohlížeč dovolí (na iPhonu ne, tam zůstane překryv)
  const req = overlay.requestFullscreen ?? overlay.webkitRequestFullscreen;
  try {
    req?.call(overlay)?.catch?.(() => {});
  } catch {
    /* bez celé obrazovky to funguje taky */
  }
}

function closeOverlay() {
  overlayMode = null;
  overlay.hidden = true;
  overlay.innerHTML = '';
  document.body.classList.remove('ov-open');
  const fs = document.fullscreenElement ?? document.webkitFullscreenElement;
  if (fs) (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
}

overlay.addEventListener('click', (e) => {
  const el = e.target.closest('[data-ov]');
  if (!el) return;
  const a = el.dataset.ov;
  if (a === 'close') return closeOverlay();
  if (a === 'zoom') overlayZoom = !overlayZoom;
  else {
    overlayMode = a;
    overlayZoom = false;
  }
  renderOverlay();
});
// Když uživatel opustí celou obrazovku gestem nebo klávesou Esc, zavře se i překryv.
const onFsChange = () => {
  if (!(document.fullscreenElement ?? document.webkitFullscreenElement) && overlayMode) closeOverlay();
};
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlayMode) closeOverlay();
  if (e.key === 'Escape') closeModal();
});
// telefon s už otevřenou aplikací: načtení QR kódu změní jen část adresy za #
window.addEventListener('hashchange', async () => {
  if (await openFromLink()) renderAll({ keepScroll: false });
});
let fitTimer;
window.addEventListener('resize', () => {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    if (overlayMode === 'prubeh') fitPrubeh();
    // záloha pro prohlížeče bez ResizeObserver
    $$('canvas[data-sig]').forEach((c) => sizePad(c, c.dataset.sig));
  }, 100);
});

// ---------- výstup (PDF / PNG) ----------
const env = {
  createCanvas: (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },
  loadImage: (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    }),
};

const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

let previewToken = 0;
async function renderPreview() {
  const token = ++previewToken;
  const pages = await renderPages(S, comp(), env, { scale: 1.6, logos: currentLogos() });
  const box = $('#preview');
  if (token !== previewToken || tab !== 'vystup' || !box) return;
  box.replaceChildren(...pages);
}

/**
 * Smí aplikace přečíst, co nakreslila? Některé prohlížeče to kvůli ochraně proti sledování blokují
 * nebo obraz pozmění (Firefox s resistFingerprinting, LibreWolf, Tor, rozšíření typu CanvasBlocker).
 * Pak by PDF, obrázek i podpisy vyšly prázdné nebo nesmyslné, proto se to ověřuje předem.
 */
// Pamatuje se jen úspěch: LibreWolf a Firefox s ochranou proti sledování se na čtení zeptají
// ikonou v adresním řádku, a když ho uživatel povolí, musí to aplikace poznat bez obnovení stránky.
let canvasCheck = false;
function canvasReadable() {
  if (canvasCheck) return true;
  try {
    const c = env.createCanvas(8, 8);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(10, 200, 30)';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillStyle = 'rgb(250, 20, 140)';
    ctx.fillRect(4, 4, 4, 4);
    const a = ctx.getImageData(1, 1, 1, 1).data;
    const b = ctx.getImageData(6, 6, 1, 1).data;
    canvasCheck =
      a[0] === 10 && a[1] === 200 && a[2] === 30 && a[3] === 255 && b[0] === 250 && b[1] === 20 && b[2] === 140;
  } catch {
    canvasCheck = false;
  }
  return canvasCheck;
}

const CANVAS_BLOCKED =
  'Prohlížeč nedovoluje aplikaci uložit obrázek zápisu (ochrana proti sledování, blokování „canvas“), ' +
  'PDF by vyšlo prázdné. V LibreWolfu a ve Firefoxu s ochranou proti sledování se v adresním řádku ' +
  'objeví ikona obrázku: klikni na ni a čtení obrazových dat pro tuto stránku povol, pak akci opakuj. ' +
  'Jinak vypni rozšíření, které „canvas“ blokuje, nebo zápis vytvoř v jiném prohlížeči (Firefox, Chrome, Edge, Safari).';

function ensureCanvas() {
  if (canvasReadable()) return true;
  alert(CANVAS_BLOCKED);
  return false;
}

/** Obrázek strany do PDF: bezeztrátově (ostrý text), kde to prohlížeč umí, jinak JPEG. */
async function pageImage(c) {
  const { width, height } = c;
  if (typeof CompressionStream !== 'undefined') {
    const rgba = c.getContext('2d').getImageData(0, 0, width, height).data;
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    const zipped = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
    return { data: new Uint8Array(await new Response(zipped).arrayBuffer()), filter: 'FlateDecode', width, height };
  }
  const blob = await toBlob(c, 'image/jpeg', 0.92);
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  // prohlížeč, který JPEG neumí, vrátí potichu PNG; to by v PDF vyšlo jako prázdná plocha
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Prohlížeč neumí vytvořit obrázek JPEG.');
  return { jpeg, width, height };
}

async function makePdfBlob() {
  const pages = await renderPages(S, comp(), env, { scale: 2, logos: currentLogos() });
  const list = [];
  for (const c of pages) list.push(await pageImage(c));
  const bytes = buildPdf(list, { title: `Zapis o utkani ${S.date}` });
  return new Blob([bytes], { type: 'application/pdf' });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function exportPdf() {
  if (!ensureCanvas()) return;
  toast('Vytvářím PDF…');
  download(await makePdfBlob(), `${L.fileBase(S, comp())}.pdf`);
}

async function exportPng() {
  if (!ensureCanvas()) return;
  toast('Vytvářím obrázek…');
  const pages = await renderPages(S, comp(), env, { scale: 2, logos: currentLogos() });
  for (let i = 0; i < pages.length; i++) {
    const blob = await toBlob(pages[i], 'image/png');
    download(blob, `${L.fileBase(S, comp())}${pages.length > 1 ? `_strana${i + 1}` : ''}.png`);
  }
}

async function shareFiles() {
  if (!ensureCanvas()) return;
  const pdf = await makePdfBlob();
  const file = new File([pdf], `${L.fileBase(S, comp())}.pdf`, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Zápis o utkání' });
    } catch {
      /* uživatel zrušil */
    }
  } else toast('Sdílení souboru toto zařízení nepodporuje, použij stažení.');
}

/** Na tabletu a telefonu jde PDF poslat jako přílohu přes nabídku sdílení, na počítači přes mailto. */
function prefersShare() {
  return !!(uiMode() === 'touch' && navigator.canShare && navigator.share);
}

async function sendMail() {
  if (!ensureCanvas()) return;
  const to = ($('#mailTo')?.value ?? '').trim();
  store.rememberMail(S.compId, to);
  const issues = L.validate(S, comp(), { forFinal: true });
  if (L.hasErrors(issues) && !confirm('Zápis obsahuje chyby (viz Kontrola zápisu). Opravdu ho odeslat?')) return;
  toast('Připravuji zápis…');
  const name = `${L.fileBase(S, comp())}.pdf`;
  const pdf = await makePdfBlob();
  const subject = L.mailSubject(S, comp());
  if (prefersShare()) {
    const file = new File([pdf], name, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      if (to) {
        try {
          await navigator.clipboard.writeText(to);
          toast('Adresa příjemce je zkopírovaná, vlož ji do e-mailu.');
        } catch {
          /* schránka nedostupná, adresu člověk opíše */
        }
      }
      try {
        await navigator.share({ files: [file], title: subject, text: L.mailBody(S, comp()) });
      } catch {
        /* uživatel zrušil */
      }
      return;
    }
  }
  // Odkaz mailto přílohu přidat neumí: PDF se stáhne a otevře se e-mail s předmětem a textem.
  download(pdf, name);
  const body = L.mailBody(S, comp(), { attached: false, fileName: name });
  const href = `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  setTimeout(() => {
    window.location.href = href;
  }, 400);
  toast('PDF je stažené, přilož ho do otevřeného e-mailu.');
}

function newMatch() {
  S = L.newMatch();
  S.compId = DATA.competitions[0]?.id ?? '';
  save();
  tab = 'zapas';
  rememberTab('zapas');
  renderAll({ keepScroll: false });
}

// ---------- události ----------
view.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act;
  const side = el.dataset.side;
  switch (a) {
    case 'go':
      return goTo(el.dataset.tab);
    case 'pickMatch': {
      const round = comp()?.rounds.find((r) => String(r.no) === String(S.round));
      const m = round?.matches[Number(el.dataset.i)];
      if (!m) return;
      setTeam('home', m.home);
      setTeam('away', m.away);
      if (round.date) S.date = round.date;
      save();
      return renderView();
    }
    case 'toggle': {
      const no = Number(el.dataset.no);
      const t = teamOf(side);
      const idx = S[side].lineup.findIndex((p) => p.no === no);
      if (idx >= 0) S[side].lineup.splice(idx, 1);
      else {
        if (S[side].lineup.length >= boards()) return toast(`Sestava může mít nejvýše ${boards()} hráčů.`);
        const p = t.players.find((x) => x.no === no);
        S[side].lineup.push({
          no: p.no,
          name: p.name,
          types: [...(p.types ?? [])],
          rtg: p.rtg ?? null,
          fide: p.fide ?? null,
          nat: p.nat ?? null,
        });
      }
      save();
      return renderView();
    }
    case 'editRow': {
      editRow = editRow === el.dataset.key ? null : el.dataset.key;
      renderView();
      if (editRow) $(`.lu-row.editing input`)?.focus();
      return;
    }
    case 'rm': {
      S[side].lineup = S[side].lineup.filter((p) => p.no !== Number(el.dataset.no));
      save();
      return renderView();
    }
    case 'addManual': {
      const box = $(`[data-manual="${side}"]`);
      const get = (k) => $(`[data-m="${k}"]`, box).value.trim();
      const no = parseInt(get('no'), 10);
      const name = get('name');
      if (!Number.isFinite(no) || no < 1 || !name) return toast('Vyplň pořadí na soupisce a jméno.');
      if (S[side].lineup.some((p) => p.no === no)) return toast(`Hráč s pořadím ${no} už je v sestavě.`);
      if (S[side].lineup.length >= boards()) return toast(`Sestava může mít nejvýše ${boards()} hráčů.`);
      const num = (v) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : null);
      const player = { no, name, types: get('type') ? [get('type')] : [], rtg: null, fide: null, nat: null, manual: true };
      for (const r of L.ratingColumns([...(teamOf(side)?.players ?? []), ...S[side].lineup])) player[r.key] = num(get(r.key));
      S[side].lineup.push(player);
      save();
      return renderView();
    }
    case 'openBoard': {
      const b = Number(el.dataset.b);
      openBoard = openBoard === b ? null : b;
      return renderView();
    }
    case 'res': {
      const b = Number(el.dataset.b);
      const c = el.dataset.c;
      L.setBoardResult(S, b, !c || L.boardResult(S, b) === c ? null : c);
      save();
      // po zadání se výběr zavře, ať je vidět přehled utkání
      if (c && L.boardResult(S, b)) openBoard = null;
      return renderView();
    }
    case 'preset': {
      const text = NOTE_PRESETS[Number(el.dataset.i)][1];
      S.notes = S.notes?.trim() ? `${S.notes.trimEnd()}\n${text}` : text;
      save();
      renderView();
      const ta = $('#notes');
      ta?.focus();
      ta?.setSelectionRange(ta.value.length, ta.value.length);
      return;
    }
    case 'clearSig': {
      const key = el.dataset.key;
      S.sig[key] = '';
      save();
      const c = $(`canvas[data-sig="${key}"]`);
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      return;
    }
    case 'fullscreen':
      return openOverlay(el.dataset.mode);
    case 'qrSign':
      return showQr();
    case 'pdf':
      return exportPdf();
    case 'png':
      return exportPng();
    case 'share':
      return shareFiles();
    case 'mail':
      return sendMail();
    case 'logoRemove': {
      if (!confirm('Odebrat logo z tohoto zařízení?')) return;
      saveLogo(el.dataset.slot, null);
      return renderView();
    }
    case 'archive': {
      const issues = L.validate(S, comp(), { forFinal: true });
      if (L.hasErrors(issues) && !confirm('Zápis obsahuje chyby. Opravdu ho uložit do archivu?')) return;
      // počet šachovnic a údaje o soutěži do zápisu, aby šel otevřít i bez dat soutěže
      S.boards = boards();
      S.compInfo = compSnapshot();
      if (!store.archiveMatch(S)) return toast('Zápis se nepodařilo uložit (plné úložiště zařízení).');
      askPersistentStorage();
      store.rememberReferee(S.referee.name);
      store.rememberVenue(S.home.team, S.venue);
      toast('Zápis je uložený v archivu.');
      return newMatch();
    }
    case 'openArch': {
      const m = store.loadArchive().find((x) => x.id === el.dataset.id);
      if (!m) return;
      const inArchive = store.loadArchive().some((x) => x.id === S.id);
      const started = S.home.team || S.away.team || S.home.lineup.length || S.away.lineup.length;
      if (started && !inArchive && S.id !== m.id && !confirm('Rozpracovaný zápis není v archivu a otevřením se zahodí. Pokračovat?')) return;
      S = JSON.parse(JSON.stringify(m));
      save();
      return goTo('vystup');
    }
    case 'delArch':
      if (confirm('Opravdu smazat tento zápis z archivu?')) {
        store.deleteFromArchive(el.dataset.id);
        retrySave();
        renderView();
      }
      return;
    case 'exportArch': {
      const list = store.loadArchive();
      if (!list.length) return toast('Archiv je prázdný.');
      return download(
        new Blob([JSON.stringify(makeBackup(list), null, 1)], { type: 'application/json' }),
        `zapisy-archiv-${new Date().toLocaleDateString('sv-SE')}.json`,
      );
    }
    case 'exportOne': {
      const m = store.loadArchive().find((x) => x.id === el.dataset.id);
      if (!m) return;
      return download(
        new Blob([JSON.stringify(makeBackup([m]), null, 1)], { type: 'application/json' }),
        `${L.fileBase(m, archComp(m))}.json`,
      );
    }
    case 'delOld': {
      const list = store.loadArchive();
      const old = olderThan(list, retentionMonths());
      if (!old.length) return;
      if (!confirm(`Smazat ${old.length} starých zápisů z archivu? Nejde to vrátit.`)) return;
      const ids = new Set(old.map((m) => m.id));
      store.saveArchive(list.filter((m) => !ids.has(m.id)));
      retrySave();
      toast('Staré zápisy jsou smazané.');
      return renderView();
    }
    case 'clearAll': {
      if (!confirm('Smazat všechna data aplikace z tohoto zařízení? Zmizí rozpracovaný zápis, archiv, loga i nastavení. Nejde to vrátit.')) return;
      store.clearAll();
      try {
        caches?.keys?.().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).finally(() => location.reload());
      } catch {
        location.reload();
      }
      return;
    }
    case 'toggleAdd':
      addComp = { ...addComp, open: !addComp.open, msg: '', error: '' };
      return renderView();
    case 'downloadExports': {
      const tnr = tournamentNumber(addComp.url);
      if (tnr === null) return toast('Nejdřív vlož odkaz na turnaj.');
      // Stahuje se přes skrytý rámec: server posílá hlavičku attachment, takže se soubor uloží
      // a nikam se neodchází. Oproti otevření okna to neblokuje hlídač vyskakovacích oken.
      for (const art of [8, 2]) {
        const frame = document.createElement('iframe');
        frame.hidden = true;
        frame.src = exportUrl(tnr, art);
        document.body.append(frame);
        setTimeout(() => frame.remove(), 60000);
      }
      addComp = { ...addComp, downloaded: true, error: '', msg: '' };
      renderView();
      toast('Stahuju oba soubory. Pak je nahraj níže.');
      return;
    }
    case 'delComp': {
      const id = el.dataset.id;
      const target = DATA.competitions.find((x) => x.id === id);
      if (!confirm(`Opravdu odebrat soutěž ${target?.short ?? id} z tohoto zařízení?`)) return;
      store.deleteUserComp(id);
      DATA = reloadUserComps();
      if (S.compId === id) resetCompetition(DATA.competitions[0]?.id ?? '');
      save();
      $('#dataStatus').textContent = dataSummary(DATA);
      toast('Soutěž odebraná.');
      return renderView();
    }
  }
});

/**
 * Doplní rozlosování k soutěži, která už je přidaná. Vrací počet načtených kol.
 * Používá se, když uživatel nahraje jen export seznamu „Los družstev pro všechna kola“.
 */
async function attachRounds(files) {
  const { roster, draw, title } = await readFiles(files);
  if (roster) return null; // soubory obsahují i soupisky, řeší se jako nová soutěž
  const target =
    (comp()?.local ? comp() : null) ??
    DATA.competitions.find((c) => c.local && title && c.name && clean(title).startsWith(c.name));
  if (!target) {
    throw new Error(
      'Nejdřív přidej soutěž ze soupisek. Pak u ní můžeš doplnit kola nahráním exportu „Los družstev pro všechna kola“.',
    );
  }
  const rounds = roundsFor(draw, target.teams.map((t) => t.name));
  if (!rounds.length) {
    throw new Error(
      `V souboru nejsou kola družstev z vybrané soutěže (${target.name}). Zkontroluj, že export je z téže soutěže.`,
    );
  }
  const updated = { ...target, rounds };
  if (!store.saveUserComp(updated)) throw new Error('Nepodařilo se uložit, úložiště zařízení je plné.');
  DATA = reloadUserComps();
  S.compId = updated.id;
  S.round = '';
  save();
  $('#dataStatus').textContent = dataSummary(DATA);
  return { comp: updated, rounds: rounds.length };
}

/** Přečte nahrané soubory, vytvoří z nich soutěž a uloží ji do zařízení. */
async function loadNewCompetition(files) {
  const boards = Number(addComp.boards);
  addComp = { ...addComp, busy: true, msg: 'Čtu soubory…', error: '' };
  renderView();
  try {
    {
      const attached = await attachRounds(files);
      if (attached) {
        addComp = {
          ...addComp,
          busy: false,
          msg: `K soutěži ${attached.comp.name} se doplnilo ${attached.rounds} kol. Teď jde vybrat kolo a zápas.`,
          error: '',
        };
        renderView();
        toast('Rozlosování doplněno.');
        return;
      }
    }
    const comp = await buildFromFiles(files, { boards, short: addComp.short, url: addComp.url });
    if (comp.tnr && DATA.competitions.some((x) => x.tnr === comp.tnr && !x.local)) {
      throw new Error('Tahle soutěž už v aplikaci je mezi sdílenými, přidávat ji nemusíš.');
    }
    if (!store.saveUserComp(comp)) throw new Error('Soutěž se nepodařilo uložit, úložiště zařízení je plné.');
    DATA = reloadUserComps();
    S.compId = comp.id;
    S.round = '';
    S.home = { team: '', lineup: [], captain: '' };
    S.away = { team: '', lineup: [], captain: '' };
    S.results = {};
    save();
    $('#dataStatus').textContent = dataSummary(DATA);
    const players = comp.teams.reduce((n, t) => n + t.players.length, 0);
    addComp = {
      ...addComp,
      busy: false,
      url: '',
      short: '',
      msg:
        `Přidáno: ${comp.name}. Načteno ${comp.teams.length} družstev, ${players} hráčů` +
        (comp.rounds.length
          ? ` a ${comp.rounds.length} kol.`
          : '. Rozlosování mezi soubory nebylo, takže se nedají vybrat kola a družstva zadáš ručně. Druhý soubor jde nahrát kdykoli potom.'),
      error: '',
    };
    renderView();
    toast('Soutěž je přidaná a vybraná.');
  } catch (e) {
    addComp = { ...addComp, busy: false, msg: '', error: e.message };
    renderView();
  }
}

view.addEventListener('change', async (e) => {
  const input = e.target;
  if (input.dataset.act === 'logoUpload') {
    const file = input.files?.[0];
    if (!file) return;
    const slot = input.dataset.slot;
    if ((slot === 'home' || slot === 'away') && !S[slot].team) return toast('Nejdřív vyber družstvo.');
    try {
      const dataUrl = await fileToLogo(file);
      if (!saveLogo(slot, dataUrl)) return toast('Logo se nepodařilo uložit, úložiště zařízení je plné.');
      S.logos = { ...L.logoFlags(S), [slot]: true };
      save();
      toast('Logo je nahrané.');
    } catch {
      toast('Tenhle soubor se jako obrázek načíst nepodařilo.');
    }
    return renderView();
  }
  if (input.dataset.act === 'importArch') {
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    let list = store.loadArchive();
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    for (const f of files) {
      try {
        const r = mergeArchive(list, parseBackup(await f.text()));
        list = r.list;
        added += r.added;
        updated += r.updated;
        skipped += r.skipped;
      } catch (err) {
        errors.push(`${f.name}: ${err.message}`);
      }
    }
    if (added || updated) {
      if (!store.saveArchive(list)) return toast('Archiv se nepodařilo uložit, úložiště zařízení je plné.');
    }
    renderView();
    if (errors.length && !(added || updated || skipped)) return toast(errors[0]);
    const parts = [`nové ${added}`, updated ? `aktualizované ${updated}` : '', skipped ? `už v archivu ${skipped}` : ''].filter(Boolean);
    toast(`Nahráno: ${parts.join(', ')}.${errors.length ? ` ${errors.length} soubor se nepodařilo přečíst.` : ''}`);
    return;
  }
  if (input.dataset.act !== 'uploadRoster') return;
  const files = [...(input.files ?? [])];
  if (!files.length) return;
  await loadNewCompetition(files);
});

view.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.add) {
    addComp[el.dataset.add] = el.value;
    if (el.dataset.add === 'url') syncUrlUi();
    return;
  }
  if (el.dataset.bind) {
    setPath(S, el.dataset.bind, el.value);
    save();
  } else if (el.dataset.edit) {
    const p = S[el.dataset.side].lineup.find((x) => x.no === Number(el.dataset.no));
    if (!p) return;
    const f = el.dataset.edit;
    if (f === 'name') p.name = el.value;
    else p[f] = Number.isFinite(parseInt(el.value, 10)) ? parseInt(el.value, 10) : null;
    save();
  }
});

view.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.add) addComp[el.dataset.add] = el.value;
  if (el.dataset.venue) store.rememberVenue(S.home.team, el.value);
  switch (el.dataset.chg) {
    case 'comp':
      resetCompetition(el.value);
      compFailed = null;
      save();
      return renderView();
    case 'round':
      S.round = el.value;
      save();
      return renderView();
    case 'team':
      setTeam(el.dataset.side, el.value);
      save();
      return renderView();
    case 'matchBoards': {
      const n = parseInt(el.value, 10);
      // prázdné nebo nesmyslné vrátí počet podle soutěže
      S.boards = Number.isInteger(n) && n >= 1 && n <= 24 ? n : null;
      S.results = {};
      save();
      return renderView();
    }
    case 'feature':
      setSetting(`features.${el.dataset.key}`, el.checked);
      return toast(`${FEATURES.find((f) => f[0] === el.dataset.key)?.[1]}: ${el.checked ? 'zapnuto' : 'vypnuto'}.`);
    case 'uiPref':
      store.setUiPref(el.value);
      applyUi();
      return renderView();
    case 'retention':
      setSetting('retention', Number(el.value));
      return;
    case 'region': {
      setSetting('region', el.value);
      prefetchMyRegion();
      const r = REGIONS.find((x) => x.code === el.value);
      return toast(r ? `Soutěže: celostátní a ${r.name}.` : 'Soutěže: všechny kraje.');
    }
    case 'logo':
      S.logos = { ...L.logoFlags(S), [el.dataset.slot]: el.checked };
      save();
      return renderView();
    case 'refRole':
      S.referee.role = el.value;
      if (el.value === 'captain' && S.home.captain) S.referee.name = S.home.captain;
      save();
      return renderView();
    case 'refPick':
      if (!el.value) return;
      S.referee.name = el.value;
      // vybraný hráč ze soupisky: když funkce byla delegovaný rozhodčí, přepne se na hráče
      if (S.referee.role === 'delegated') S.referee.role = el.value === S.home.captain ? 'captain' : 'player';
      save();
      return renderView();
  }
});

stepsEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el?.dataset.act === 'go') goTo(el.dataset.tab);
});

$('#appMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  $('#appMenu').open = false;
  if (b.dataset.menu === 'new') {
    const started = S.home.team || S.away.team || S.home.lineup.length || S.away.lineup.length;
    const inArchive = store.loadArchive().some((x) => x.id === S.id);
    if (!started || inArchive || confirm('Rozpracovaný zápis není v archivu. Zahodit ho a začít nový?')) newMatch();
    return;
  }
  goTo(b.dataset.menu);
});
// klepnutí mimo menu ho zavře
document.addEventListener('click', (e) => {
  const m = $('#appMenu');
  if (m.open && !m.contains(e.target)) m.open = false;
});
// automatický režim sleduje zařízení (např. připojená myš k tabletu)
window.matchMedia?.('(hover: hover) and (pointer: fine)').addEventListener?.('change', () => {
  if (store.uiPref() === 'auto') {
    applyUi();
    renderView();
  }
});

$('#btnRefresh').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.classList.add('spin');
  try {
    DATA = await refreshData();
    compFailed = null;
    await loadCompData(S.compId, { fresh: true });
    $('#dataStatus').textContent = dataSummary(DATA);
    toast(compLoadError || 'Soupisky jsou aktuální.');
    renderView();
    prefetchMyRegion();
  } catch {
    toast('Soupisky se nepodařilo stáhnout (jsi online?). Používají se uložené.');
  } finally {
    btn.classList.remove('spin');
  }
});

// ---------- aktualizace aplikace ----------
// Nová verze se stáhne na pozadí. Aby nikdo nepracoval se starou (třeba telefon, který načte QR kód
// a stará verze o odkazu se zápisem neví), aplikace se po stažení sama obnoví, pokud čeká zápis z odkazu
// nebo byla právě spuštěná. Jinak nabídne obnovení tlačítkem, aby se nepřerušila rozdělaná práce.
function showUpdateBar() {
  if ($('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = '<span>Je připravená nová verze aplikace.</span><button class="btn small" type="button">Načíst</button>';
  $('button', bar).addEventListener('click', () => location.reload());
  document.body.append(bar);
}

function setupUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const startedAt = Date.now();
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // první instalace, stránka už běží z nové verze
    if (hasLink(location.hash) || Date.now() - startedAt < 20000) {
      reloading = true;
      location.reload();
    } else showUpdateBar();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      // aplikace otevřená delší dobu: při návratu do ní se podívat po nové verzi
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}

// ---------- start ----------
async function init() {
  // hlídání nové verze hned na začátku: nová verze se může nainstalovat dřív, než se stáhnou soupisky
  setupUpdates();
  applyUi();
  const st = savedTab();
  if (st && isStep(st)) tab = lastStep = st;
  try {
    const r = await loadData();
    DATA = r.data;
    if (r.source === 'cache') toast('Bez internetu: používám uložené soupisky.');
  } catch {
    toast('Soupisky se nepodařilo načíst.');
  }
  await openFromLink();
  // výchozí soutěž jen pro nový zápis; zápis z archivu nebo z QR kódu si nese vlastní údaje o soutěži
  if (!DATA.competitions.some((c) => c.id === S.compId) && !S.compInfo) S.compId = DATA.competitions[0]?.id ?? '';
  $('#dataStatus').textContent = dataSummary(DATA);
  renderAll({ keepScroll: false });
  prefetchMyRegion();
}

init();
