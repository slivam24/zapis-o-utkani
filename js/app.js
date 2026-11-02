import * as L from './logic.js';
import { renderPages } from './render.js';
import { buildPdf } from './pdf.js';
import { loadData, refreshData, reloadUserComps, dataSummary } from './data.js';
import { loadCompetition, buildCompetition, issueUrl, DEFAULT_PROXIES } from './sources.js';
import { tournamentNumber } from './parse.js';
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
let addComp = { open: false, busy: false, url: '', boards: '8', short: '', msg: '', error: '', showProxy: false };

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
const boards = () => comp()?.boards ?? 8;
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
function addPanel() {
  const proxies = store.loadProxies();
  const boardOpts = [8, 5, 6, 4, 10, 12]
    .map((n) => `<option ${String(n) === addComp.boards ? 'selected' : ''}>${n}</option>`)
    .join('');
  // průběžná hláška se musí lišit od hotového výsledku, jinak vypadá načítání jako úspěch
  const status = addComp.error
    ? `<ul class="issues"><li class="error">${esc(addComp.error)}</li></ul>`
    : addComp.msg
      ? `<ul class="issues"><li class="${addComp.busy ? 'info' : 'okmsg'}">${esc(addComp.msg)}</li></ul>`
      : '';
  const fallback = `<details ${addComp.error ? 'open' : ''}>
      <summary>Když načtení nefunguje</summary>
      <p class="small-text muted">Načítání jde přes prostředníka, protože chess-results čtení z prohlížeče nepovoluje.
      Když veřejná služba zrovna nefunguje, máš tři náhradní cesty.</p>
      <div class="row">
        <a class="btn small secondary" href="${esc(issueUrl(REPO, addComp))}" target="_blank" rel="noopener">Požádat o přidání na GitHubu</a>
        <button class="btn small ghost" type="button" data-act="proxySettings">Nastavit vlastní adresu</button>
      </div>
      <p class="small-text muted" style="margin-top:.6rem">Nebo nahraj uloženou stránku se soupiskami: na chess-results
      zobraz <em>Sestava družstva bez výsledků</em> a ulož stránku jako soubor. Rozlosování se tak nenačte,
      družstva se pak vybírají ručně.</p>
      <label class="field"><span>Soubor se soupiskami (.html)</span>
        <input type="file" accept=".html,.htm,text/html" data-act="uploadRoster"></label>
    </details>`;
  const proxyBox = addComp.showProxy
    ? `<label class="field" style="margin-top:.6rem"><span>Vlastní adresy prostředníka, každá na řádek (prázdné = veřejné)</span>
         <textarea data-proxy style="min-height:80px" placeholder="${esc(DEFAULT_PROXIES[0])}">${esc(proxies.join('\n'))}</textarea></label>
       <div class="row"><button class="btn small secondary" type="button" data-act="saveProxy">Uložit adresy</button></div>
       <p class="small-text muted">Zástupný text <code>{url}</code> se nahradí adresou stránky. Návod na vlastní prostředníka je v repozitáři ve složce <code>worker</code>.</p>`
    : '';
  return `<div class="card" style="margin:.8rem 0 0;background:var(--sel)">
    <h3>Přidat soutěž z chess-results</h3>
    <p class="small-text muted">Vlož odkaz na turnaj. Název soutěže, sezónu, soupisky i rozlosování si aplikace načte sama.
    Soutěž zůstane uložená v tomhle zařízení.</p>
    <div class="grid two">
      <label class="field"><span>Odkaz na turnaj</span>
        <input type="text" data-add="url" value="${esc(addComp.url)}" placeholder="https://chess-results.com/tnr1507857.aspx" autocomplete="off" inputmode="url"></label>
      <label class="field"><span>Počet šachovnic</span><select data-add="boards">${boardOpts}</select></label>
      <label class="field"><span>Zkratka do nabídky (nepovinné)</span>
        <input type="text" data-add="short" value="${esc(addComp.short)}" placeholder="podle názvu soutěže" autocomplete="off"></label>
    </div>
    <div class="row" style="margin-top:.6rem">
      <button class="btn" type="button" data-act="loadComp" ${addComp.busy ? 'disabled' : ''}>${addComp.busy ? 'Načítám…' : 'Načíst soutěž'}</button>
      <button class="btn ghost small" type="button" data-act="proxySettings">${addComp.showProxy ? 'Skrýt nastavení' : 'Nastavení načítání'}</button>
    </div>
    ${proxyBox}
    ${status}
    ${fallback}
  </div>`;
}

function viewZapas() {
  const c = comp();
  const teams = c?.teams ?? [];
  const rounds = c?.rounds ?? [];
  const round = rounds.find((r) => String(r.no) === String(S.round));

  const compOpts = DATA.competitions
    .map(
      (x) =>
        `<option value="${esc(x.id)}" ${x.id === S.compId ? 'selected' : ''}>${esc(x.short)} – ${esc(x.name)}${
          x.group ? ` ${esc(x.group)}` : ''
        }${x.teams.length ? '' : ' (bez soupisek)'}</option>`,
    )
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
             }" data-act="pickMatch" data-i="${i}">${esc(m.home)} <span class="muted">–</span> ${esc(m.away)}</button>`,
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
    <div class="card">
      <h2>Družstva</h2>
      ${
        teams.length
          ? ''
          : '<p class="muted small-text">Pro tuto soutěž zatím nejsou soupisky. Názvy družstev a hráče můžeš zadat ručně.</p>'
      }
      <div class="grid two">${teamField('home', 'Domácí družstvo')}${teamField('away', 'Hostující družstvo')}</div>
    </div>
    <div class="card">
      <h2>Datum a místo</h2>
      <div class="grid two">
        <label class="field"><span>Hráno dne</span><input type="date" data-bind="date" value="${esc(S.date)}"></label>
        <label class="field"><span>V hrací místnosti</span><input type="text" data-bind="venue" data-venue="1" value="${esc(S.venue)}" autocomplete="off" placeholder="Název a adresa herny"></label>
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
  const rows = lineup
    .map(
      (p, i) => `<tr>
        <td class="b">${i + 1}.</td>
        <td><input type="text" data-edit="name" data-side="${side}" data-no="${p.no}" value="${esc(p.name)}" aria-label="Jméno"></td>
        <td style="white-space:nowrap">${esc(L.typeLabel(p.types))}</td>
        ${ratings
          .map(
            (r) => `<td class="rt"><input type="text" inputmode="numeric" data-edit="${r.key}" data-side="${side}" data-no="${p.no}" value="${esc(p[r.key] ?? '')}" aria-label="${esc(r.label)}" placeholder="${esc(r.short)}"></td>`,
          )
          .join('')}
        <td><button class="btn small ghost" type="button" data-act="rm" data-side="${side}" data-no="${p.no}" aria-label="Odebrat ze sestavy">✕</button></td>
      </tr>`,
    )
    .join('');

  return `<div class="card">
    <h2>${label}: ${esc(S[side].team || '—')}</h2>
    ${sideCounters(side)}
    ${roster}
    <h3 style="margin-top:1rem">Sestava (šachovnice podle pořadí na soupisce)</h3>
    ${
      lineup.length
        ? `<table class="lineup"><thead><tr><th>Šach.</th><th>Příjmení, jméno</th><th>Typ</th>${ratings
            .map((r) => `<th>${esc(r.short)}</th>`)
            .join('')}<th></th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="muted">Zatím nikdo nevybrán.</p>'
    }
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
  const score = t.missing.length ? '– : –' : `${L.fmtPoints(t.home)} : ${L.fmtPoints(t.away)}`;

  const rows = [];
  for (let i = 1; i <= b; i++) {
    const hp = home[i - 1];
    const ap = away[i - 1];
    const code = L.boardResult(S, i);
    const white = L.homeIsWhite(i);
    const nm = (p) => (p ? esc(p.name) : '<span class="muted">neobsazeno</span>');
    let ctrl;
    if (hp && ap) {
      const btn = (c) => `<button type="button" data-act="res" data-b="${i}" data-c="${c}" class="${code === c ? 'on' : ''}">${L.RESULTS[c].label}</button>`;
      ctrl = `<div class="res">${['W', 'D', 'L'].map(btn).join('')}</div><div class="res k">${['WK', 'XK', 'LK'].map(btn).join('')}</div>`;
    } else {
      ctrl = `<div class="auto">Kontumace: ${L.RESULTS[code].label}</div>`;
    }
    rows.push(`<div class="board">
      <div class="who">
        <div class="l"><span class="dot ${white ? 'w' : 'b'}"></span>${nm(hp)}</div>
        <div class="bn">${i}</div>
        <div class="rr">${nm(ap)}<span class="dot ${white ? 'b' : 'w'}"></span></div>
      </div>${ctrl}</div>`);
  }
  return `<div class="card">
      <div class="who" style="display:grid;grid-template-columns:1fr auto 1fr;gap:.5rem;align-items:center">
        <div><b>${esc(S.home.team || 'Domácí')}</b></div>
        <div class="score">${score}</div>
        <div style="text-align:right"><b>${esc(S.away.team || 'Hosté')}</b></div>
      </div>
      <p class="muted small-text" style="text-align:center">Zadáno ${done} z ${b} šachovnic. Domácí hrají bílými na lichých šachovnicích. Kontumace (K) se počítá jako plný bod.</p>
    </div>
    ${rows.join('')}
    <div class="actions">
      <button class="btn secondary" data-act="go" data-tab="sestavy" type="button">← Zpět</button>
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
  const list = issues.length
    ? `<ul class="issues">${issues.map((i) => `<li class="${i.level}">${esc(i.text)}</li>`).join('')}</ul>`
    : '<ul class="issues"><li class="okmsg">Zápis je v pořádku a podle soutěžního řádu úplný.</li></ul>';
  return `
    <div class="card">
      <h2>Kontrola zápisu</h2>
      ${list}
      <div class="actions" style="margin-top:0">
        <button class="btn" type="button" data-act="pdf">Stáhnout PDF</button>
        <button class="btn" type="button" data-act="png">Stáhnout obrázek (PNG)</button>
        <button class="btn secondary" type="button" data-act="share" id="btnShare">Sdílet</button>
      </div>
    </div>
    <div class="card">
      <h2>Náhled</h2>
      <div class="preview" id="preview"><p class="muted">Vykresluji…</p></div>
    </div>
    <div class="card">
      <h2>Dokončení</h2>
      <p class="muted small-text">Uloží zápis do archivu v tomto zařízení (potřebné uchovat nejméně 6 měsíců, čl. 2.4.6) a otevře nový zápis.</p>
      <div class="actions" style="margin-top:.4rem">
        <button class="btn secondary" data-act="go" data-tab="zaver" type="button">← Zpět</button>
        <button class="btn" type="button" data-act="archive">Uložit do archivu a začít nový</button>
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
  stepsEl.innerHTML = `${items}<span class="spacer"></span>
    <button type="button" data-act="go" data-tab="archiv" class="${tab === 'archiv' ? 'active' : ''}">Archiv</button>
    <button type="button" data-act="new">Nový zápis</button>`;
}

function renderView({ keepScroll = true } = {}) {
  const saved = {};
  $$('.roster').forEach((r) => (saved[r.dataset.side] = r.scrollTop));
  const y = window.scrollY;
  view.innerHTML = (VIEWS[tab] ?? viewZapas)();
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
    case 'res': {
      const b = Number(el.dataset.b);
      const c = el.dataset.c;
      L.setBoardResult(S, b, L.boardResult(S, b) === c ? null : c);
      save();
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
    case 'proxySettings':
      addComp = { ...addComp, open: true, showProxy: !addComp.showProxy };
      return renderView();
    case 'saveProxy': {
      store.saveProxies(($('[data-proxy]')?.value ?? '').split('\n'));
      toast('Adresy uložené.');
      addComp = { ...addComp, showProxy: false };
      return renderView();
    }
    case 'loadComp':
      return loadNewCompetition();
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

/** Načte soutěž podle vloženého odkazu a uloží ji do zařízení. */
async function loadNewCompetition(fromFile = null) {
  const boards = Number(addComp.boards);
  addComp = { ...addComp, busy: true, msg: 'Načítám…', error: '' };
  renderView();
  try {
    const proxies = store.loadProxies();
    const comp = fromFile
      ? buildCompetition({
          tnr: tournamentNumber(addComp.url) ?? Date.now() % 1000000,
          boards,
          short: addComp.short,
          rosterHtml: fromFile,
        })
      : await loadCompetition(
          { url: addComp.url, boards, short: addComp.short, proxies: proxies.length ? proxies : DEFAULT_PROXIES },
          (step) => {
            addComp = { ...addComp, msg: step };
            renderView();
          },
        );
    if (DATA.competitions.some((x) => x.tnr === comp.tnr && !x.local)) {
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
      msg: `Přidáno: ${comp.name}. Načteno ${comp.teams.length} družstev, ${players} hráčů` +
        `${comp.rounds.length ? ` a ${comp.rounds.length} kol` : ', rozlosování se nepodařilo načíst'}.`,
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
  const file = input.files?.[0];
  if (!file) return;
  try {
    await loadNewCompetition(await file.text());
  } catch (err) {
    addComp = { ...addComp, error: `Soubor se nepodařilo přečíst: ${err.message}` };
    renderView();
  }
});

view.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.add) {
    addComp[el.dataset.add] = el.value;
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
    case 'refRole':
      S.referee.role = el.value;
      if (el.value === 'captain' && S.home.captain) S.referee.name = S.home.captain;
      save();
      return renderView();
  }
});

stepsEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'go') return goTo(el.dataset.tab);
  if (el.dataset.act === 'new') {
    const started = S.home.team || S.away.team || S.home.lineup.length || S.away.lineup.length;
    if (!started || confirm('Zahodit rozpracovaný zápis a začít nový?')) newMatch();
  }
});

$('#btnRefresh').addEventListener('click', async () => {
  try {
    DATA = await refreshData();
    $('#dataStatus').textContent = dataSummary(DATA);
    toast('Soupisky jsou aktuální.');
    renderView();
  } catch {
    toast('Soupisky se nepodařilo stáhnout (jsi online?). Používají se uložené.');
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
