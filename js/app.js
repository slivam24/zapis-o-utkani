import * as L from './logic.js';
import { renderPages } from './render.js';
import { buildPdf } from './pdf.js';
import { loadData, refreshData, reloadUserComps, dataSummary } from './data.js';
import { buildFromFiles, readFiles, roundsFor, issueUrl } from './sources.js';
import { clean, tournamentNumber, exportUrl } from './parse.js';
import * as store from './store.js';

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

const comp = () => DATA.competitions.find((c) => c.id === S.compId);
const boards = () => L.matchBoards(S, comp());
const teamOf = (side) => comp()?.teams.find((t) => t.name === S[side].team);

function save() {
  S.updatedAt = new Date().toISOString();
  store.saveDraft(S);
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

function viewZapas() {
  const c = comp();
  const teams = c?.teams ?? [];
  const rounds = c?.rounds ?? [];
  const round = rounds.find((r) => String(r.no) === String(S.round));

  const compLabel = (x) => {
    const full = `${x.name}${x.group ? ` ${x.group}` : ''}`;
    // zkratka se nepřidává, když je stejná jako název, ať se nabídka nezdvojuje
    const label = x.short && !full.startsWith(x.short) ? `${x.short} – ${full}` : full;
    return `${label}${x.teams.length ? '' : ' (bez soupisek)'}${x.local ? ' ★' : ''}`;
  };
  const compOpts = DATA.competitions
    .map((x) => `<option value="${esc(x.id)}" ${x.id === S.compId ? 'selected' : ''}>${esc(compLabel(x))}</option>`)
    .join('');

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
            : '<p class="muted small-text">Pro tuto soutěž zatím nejsou soupisky. Názvy družstev a hráče můžeš zadat ručně.</p>'
        }
        ${teamFields}
      </div>`;

  return `
    <div class="card">
      <h2>Soutěž a kolo</h2>
      <div class="grid two">
        <label class="field"><span>Soutěž</span><select data-chg="comp">${compOpts}</select></label>
        ${roundField}
      </div>
      <div class="row" style="margin-top:.6rem">
        <button class="btn small secondary" type="button" data-act="toggleAdd">${addComp.open ? 'Skrýt přidání soutěže' : '+ Přidat soutěž'}</button>
        ${c?.local ? `<button class="btn small danger" type="button" data-act="delComp" data-id="${esc(c.id)}">Odebrat tuhle soutěž</button>` : ''}
      </div>
      ${addComp.open ? addPanel() : ''}
      ${matchList}
    </div>
    ${teamsCard}
    <div class="card">
      <h2>Datum a místo</h2>
      <div class="grid two">
        <label class="field"><span>Hráno dne</span><input type="date" data-bind="date" value="${esc(S.date)}"></label>
        <label class="field"><span>Počet šachovnic${c ? ` (soutěž má ${c.boards})` : ''}</span>
          <input type="text" inputmode="numeric" data-chg="matchBoards" value="${esc(boards())}" autocomplete="off"></label>
        <label class="field"><span>Hrací místnost</span><input type="text" data-bind="venue" data-venue="1" value="${esc(S.venue)}" autocomplete="off"></label>
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
        <button class="icon-btn" type="button" data-act="editRow" data-key="${key}" aria-label="Upravit jméno a Elo" title="Upravit">✎</button>
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
    <details>
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
    </details>
  </div>`;
}

function viewSestavy() {
  return `${rosterCard('home', 'Domácí')}${rosterCard('away', 'Hosté')}
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
      <button class="btn small secondary fs-btn" data-act="fullscreen" data-mode="prubeh" type="button"
        title="Průběh utkání na celou obrazovku">⛶ Celá obrazovka</button>
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
      <button class="btn secondary" data-act="fullscreen" data-mode="prubeh" type="button">⛶ Celá obrazovka</button>
      <button class="btn" data-act="go" data-tab="zaver" type="button">Pokračovat na závěr →</button>
    </div>`;
}

function namesList(side) {
  return (teamOf(side)?.players ?? []).map((p) => `<option value="${esc(p.name)}">`).join('');
}

function viewZaver() {
  const refList = store.recentReferees().map((n) => `<option value="${esc(n)}">`).join('');
  const role = (v, l) => `<option value="${v}" ${S.referee.role === v ? 'selected' : ''}>${l}</option>`;
  const sigBox = (key, title, name) => `<div class="sig"><div class="cap">${title}${name ? `: ${esc(name)}` : ''}</div>
      <canvas data-sig="${key}" aria-label="Podpis: ${esc(title)}"></canvas>
      <div class="row end"><button class="btn small ghost" type="button" data-act="clearSig" data-key="${key}">Smazat podpis</button></div></div>`;
  return `
    <div class="card">
      <h2>Rozhodčí</h2>
      <div class="grid two">
        <label class="field"><span>Funkce</span><select data-chg="refRole">${role('delegated', 'Delegovaný rozhodčí')}${role('substitute', 'Náhradní rozhodčí')}${role('captain', 'Kapitán domácího družstva')}</select></label>
        <label class="field"><span>Jméno a příjmení rozhodčího</span><input type="text" list="dl-ref" data-bind="referee.name" value="${esc(S.referee.name)}" autocomplete="off"></label>
      </div>
      <datalist id="dl-ref">${refList}${namesList('home')}${namesList('away')}</datalist>
    </div>
    <div class="card">
      <h2>Kapitáni</h2>
      <div class="grid two">
        <label class="field"><span>Kapitán domácích${S.home.team ? ` (${esc(S.home.team)})` : ''}</span><input type="text" list="dl-home" data-bind="home.captain" value="${esc(S.home.captain)}" autocomplete="off"></label>
        <label class="field"><span>Kapitán hostů${S.away.team ? ` (${esc(S.away.team)})` : ''}</span><input type="text" list="dl-away" data-bind="away.captain" value="${esc(S.away.captain)}" autocomplete="off"></label>
      </div>
      <datalist id="dl-home">${namesList('home')}</datalist><datalist id="dl-away">${namesList('away')}</datalist>
      <p class="muted small-text">V nižších soutěžích bývá kapitánem někdo z domácích, ve vyšších bývá delegován. Jméno můžeš vybrat ze soupisky nebo napsat.</p>
    </div>
    <div class="card">
      <h2>Záznam rozhodčího</h2>
      <p class="muted small-text">Průběh utkání, případné přestupky či spory, námitky kapitánů. Rychlé vložení:</p>
      <div class="presets">${NOTE_PRESETS.map(([l], i) => `<button class="btn small ghost" type="button" data-act="preset" data-i="${i}">${esc(l)}</button>`).join('')}</div>
      <textarea data-bind="notes" id="notes" placeholder="Bez zápisu = prázdné pole">${esc(S.notes)}</textarea>
    </div>
    <div class="card">
      <h2>Podpisy</h2>
      <p class="muted small-text">Podepiš prstem nebo perem na displeji. Správnost zápisu potvrzují oba kapitáni a rozhodčí.</p>
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

function viewVystup() {
  const issues = L.validate(S, comp(), { forFinal: true });
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
        <button class="btn" type="button" data-act="png">Stáhnout obrázek (PNG)</button>
        <button class="btn secondary" type="button" data-act="share" id="btnShare">Sdílet</button>
      </div>
    </div>
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
        <button class="btn small secondary" type="button" data-act="fullscreen" data-mode="zapis">⛶ Celá obrazovka</button>
      </div>
      <div class="preview" id="preview" data-act="fullscreen" data-mode="zapis" title="Klepnutím zobrazíš na celou obrazovku">
        <p class="muted">Vykresluji…</p></div>
    </div>
  </div>`;
}

function viewArchiv() {
  const list = store.loadArchive();
  if (!list.length)
    return '<div class="card"><h2>Archiv</h2><p class="muted">Zatím tu nejsou žádné uložené zápisy.</p></div>';
  const items = list
    .map((m) => {
      const c = DATA.competitions.find((x) => x.id === m.compId);
      const t = L.totals(m, c?.boards ?? 8);
      const score = t.missing.length ? '' : ` · ${L.fmtPoints(t.home)} : ${L.fmtPoints(t.away)}`;
      return `<div class="it">
        <div><b>${esc(m.home.team)} – ${esc(m.away.team)}${score}</b>
        <span class="muted small-text">${esc(L.fmtDate(m.date))} · ${esc(c?.short ?? m.compId)}${m.round ? ` · ${esc(m.round)}. kolo` : ''}</span></div>
        <div class="row"><button class="btn small" type="button" data-act="openArch" data-id="${esc(m.id)}">Otevřít a stáhnout</button>
        <button class="btn small danger" type="button" data-act="delArch" data-id="${esc(m.id)}">Smazat</button></div>
      </div>`;
    })
    .join('');
  return `<div class="card"><h2>Archiv zápisů (${list.length})</h2><div class="arch">${items}</div>
    <div class="actions"><button class="btn secondary" type="button" data-act="exportArch">Stáhnout zálohu všech zápisů (JSON)</button></div></div>`;
}

const VIEWS = { zapas: viewZapas, sestavy: viewSestavy, vysledky: viewVysledky, zaver: viewZaver, vystup: viewVystup, archiv: viewArchiv };

// ---------- vykreslení ----------
function renderSteps() {
  const items = TABS.map(
    ([id, label], i) => `<button type="button" data-act="go" data-tab="${id}" class="${tab === id ? 'active' : ''}" ${tab === id ? 'aria-current="step"' : ''}><span class="n">${i + 1}</span>${label}</button>`,
  ).join('');
  stepsEl.innerHTML = items;
  $('#btnArchive').classList.toggle('active', tab === 'archiv');
  stepsEl.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderView({ keepScroll = true } = {}) {
  const saved = {};
  $$('.roster').forEach((r) => (saved[r.dataset.side] = r.scrollTop));
  const y = window.scrollY;
  view.innerHTML = (VIEWS[tab] ?? viewZapas)();
  view.classList.toggle('wide', tab === 'vystup');
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
  renderAll({ keepScroll: false });
}

function afterRender() {
  $$('canvas[data-sig]').forEach((c) => initPad(c, c.dataset.sig));
  if (tab === 'vystup') renderPreview();
  const share = $('#btnShare');
  if (share && !navigator.share) share.style.display = 'none';
}

// ---------- podpisy ----------
function initPad(canvas, key) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b2a6f';
  if (S.sig?.[key]) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = S.sig[key];
  }
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
    S.sig[key] = canvas.toDataURL('image/png');
    save();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
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
  if (mode === 'zapis') {
    const pages = await renderPages(S, comp(), env, { scale: 2 });
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
  const pages = await renderPages(S, comp(), env, { scale: 1.6 });
  const box = $('#preview');
  if (token !== previewToken || tab !== 'vystup' || !box) return;
  box.replaceChildren(...pages);
}

async function makePdfBlob() {
  const pages = await renderPages(S, comp(), env, { scale: 2 });
  const list = [];
  for (const c of pages) {
    const blob = await toBlob(c, 'image/jpeg', 0.92);
    list.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height });
  }
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
  toast('Vytvářím PDF…');
  download(await makePdfBlob(), `${L.fileBase(S, comp())}.pdf`);
}

async function exportPng() {
  toast('Vytvářím obrázek…');
  const pages = await renderPages(S, comp(), env, { scale: 2 });
  for (let i = 0; i < pages.length; i++) {
    const blob = await toBlob(pages[i], 'image/png');
    download(blob, `${L.fileBase(S, comp())}${pages.length > 1 ? `_strana${i + 1}` : ''}.png`);
  }
}

async function shareFiles() {
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

function newMatch() {
  S = L.newMatch();
  S.compId = DATA.competitions[0]?.id ?? '';
  save();
  tab = 'zapas';
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
    case 'pdf':
      return exportPdf();
    case 'png':
      return exportPng();
    case 'share':
      return shareFiles();
    case 'archive': {
      const issues = L.validate(S, comp(), { forFinal: true });
      if (L.hasErrors(issues) && !confirm('Zápis obsahuje chyby. Opravdu ho uložit do archivu?')) return;
      if (!store.archiveMatch(S)) return toast('Zápis se nepodařilo uložit (plné úložiště zařízení).');
      store.rememberReferee(S.referee.name);
      store.rememberVenue(S.home.team, S.venue);
      toast('Zápis je uložený v archivu.');
      return newMatch();
    }
    case 'openArch': {
      const m = store.loadArchive().find((x) => x.id === el.dataset.id);
      if (!m) return;
      S = JSON.parse(JSON.stringify(m));
      save();
      return goTo('vystup');
    }
    case 'delArch':
      if (confirm('Opravdu smazat tento zápis z archivu?')) {
        store.deleteFromArchive(el.dataset.id);
        renderView();
      }
      return;
    case 'exportArch':
      return download(new Blob([JSON.stringify(store.loadArchive(), null, 1)], { type: 'application/json' }), `zapisy-zaloha-${new Date().toLocaleDateString('sv-SE')}.json`);
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
    case 'refRole':
      S.referee.role = el.value;
      if (el.value === 'captain' && S.home.captain) S.referee.name = S.home.captain;
      save();
      return renderView();
  }
});

stepsEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el?.dataset.act === 'go') goTo(el.dataset.tab);
});

$('#btnArchive').addEventListener('click', () => goTo('archiv'));
$('#btnNew').addEventListener('click', () => {
  const started = S.home.team || S.away.team || S.home.lineup.length || S.away.lineup.length;
  if (!started || confirm('Zahodit rozpracovaný zápis a začít nový?')) newMatch();
});

$('#btnRefresh').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.classList.add('spin');
  try {
    DATA = await refreshData();
    $('#dataStatus').textContent = dataSummary(DATA);
    toast('Soupisky jsou aktuální.');
    renderView();
  } catch {
    toast('Soupisky se nepodařilo stáhnout (jsi online?). Používají se uložené.');
  } finally {
    btn.classList.remove('spin');
  }
});

// ---------- start ----------
async function init() {
  try {
    const r = await loadData();
    DATA = r.data;
    if (r.source === 'cache') toast('Bez internetu: používám uložené soupisky.');
  } catch {
    toast('Soupisky se nepodařilo načíst.');
  }
  if (!DATA.competitions.some((c) => c.id === S.compId)) S.compId = DATA.competitions[0]?.id ?? '';
  $('#dataStatus').textContent = dataSummary(DATA);
  renderAll({ keepScroll: false });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
