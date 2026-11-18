// Uživatelské rozhraní: turnaje jednotlivců švýcarským systémem.

import {
  newTournament, newPlayer, renumber, pairNextRound, roundRecord, scoreAfter, playerById,
  pendingGames, isAvailable, fmtPts, TITLES, RESULTS, BYE_LABEL, TIEBREAKS_SR_SWISS, POINTS_DEFAULT,
} from './model.js';
import { computeStandings, TIEBREAKS } from './tiebreaks.js';
import { tournamentToTRF, trfToTournament } from './trf.js';
import { listTournaments, loadTournament, saveTournament, deleteTournament } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const tabsEl = $('#tabs');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let T = null; // otevřený turnaj
let lastLog = null;
let editingPlayer = null;

const TABS = [
  ['kola', 'Kola'],
  ['hraci', 'Hráči'],
  ['poradi', 'Pořadí'],
  ['tabulka', 'Tabulka'],
  ['turnaj', 'Nastavení'],
  ['export', 'Export'],
];

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

function save() {
  if (!saveTournament(T)) toast('Turnaj se nepodařilo uložit (plné úložiště?)');
}

function parseHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  return { id: h.get('t'), tab: h.get('tab'), round: Number(h.get('kolo')) || null, after: Number(h.get('po')) || null };
}

function go(params) {
  const cur = parseHash();
  const next = { ...cur, ...params };
  const q = new URLSearchParams();
  if (next.id) q.set('t', next.id);
  if (next.id && next.tab) q.set('tab', next.tab);
  if (next.id && next.round) q.set('kolo', next.round);
  if (next.id && next.after) q.set('po', next.after);
  const s = q.toString();
  if (`#${s}` === location.hash || (!s && !location.hash)) render();
  else location.hash = s;
}

function render() {
  const { id, tab } = parseHash();
  if (!id) {
    T = null;
    renderHome();
    return;
  }
  if (!T || T.id !== id) T = loadTournament(id);
  if (!T) {
    location.hash = '';
    return;
  }
  $('#topTitle').textContent = T.name || 'Turnaj';
  document.title = `${T.name || 'Turnaj'} – Švýcar`;
  const active = tab || (T.players.length ? 'kola' : 'hraci');
  tabsEl.hidden = false;
  tabsEl.innerHTML = TABS.map(([k, label]) => `<a href="#t=${encodeURIComponent(T.id)}&tab=${k}"${k === active ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const fn = { kola: renderRounds, hraci: renderPlayers, poradi: renderStandings, tabulka: renderCross, turnaj: renderSettings, export: renderExport }[active] || renderRounds;
  fn();
}

// ---------------------------------------------------------------- domů
function renderHome() {
  $('#topTitle').textContent = '';
  document.title = 'Švýcar – turnaje jednotlivců';
  tabsEl.hidden = true;
  const list = listTournaments();
  view.innerHTML = `
    <section class="card">
      <h2>Turnaje jednotlivců švýcarským systémem</h2>
      <p class="muted">Losování podle holandského systému FIDE (platí od 1. 2. 2026), pomocná hodnocení FIDE (od 1. 3. 2026)
        s výchozím pořadím podle Soutěžního řádu ŠSČR. Výsledky jde zadávat z mobilu. Data zůstávají v tomto zařízení.</p>
      <form id="newForm" class="row">
        <input name="name" placeholder="Název nového turnaje" required style="flex:1;min-width:12rem" aria-label="Název nového turnaje">
        <button class="primary">＋ Nový turnaj</button>
      </form>
    </section>
    <section class="card">
      <h2>Moje turnaje</h2>
      ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Název</th><th>Místo</th><th class="num">Hráčů</th><th class="num">Kol</th><th>Upraveno</th></tr></thead><tbody>
        ${list.map((x) => `<tr><td><a href="#t=${encodeURIComponent(x.id)}">${esc(x.name || 'Bez názvu')}</a></td><td>${esc(x.city || '')}</td>
          <td class="num">${x.players}</td><td class="num">${x.paired}/${x.rounds}</td><td class="small muted">${esc(fmtDateTime(x.updated))}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Zatím tu žádný turnaj není.</p>'}
    </section>
    <section class="card">
      <h2>Načíst turnaj</h2>
      <p class="muted small">Záloha z této aplikace (.json) nebo soubor TRF (z jiného programu nebo ze zprávy pro FIDE).</p>
      <input type="file" id="importFile" accept=".json,.trf,.txt,application/json,text/plain">
    </section>`;
  $('#newForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    const t = newTournament({ name });
    saveTournament(t);
    T = t;
    go({ id: t.id, tab: 'turnaj' });
  });
  $('#importFile').addEventListener('change', importFile);
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function importFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  const text = await f.text();
  try {
    let t;
    if (text.trim().startsWith('{')) {
      t = JSON.parse(text);
      if (!t.players || !t.roundsData) throw new Error('Soubor není záloha turnaje.');
      if (loadTournament(t.id)) t.id = `t${Date.now().toString(36)}`;
    } else {
      t = trfToTournament(text);
      if (!t.players.length) throw new Error('V souboru nejsou hráči (řádky 001).');
    }
    saveTournament(t);
    T = t;
    toast('Turnaj načten');
    go({ id: t.id, tab: 'kola' });
  } catch (err) {
    toast(`Nepodařilo se načíst: ${err.message}`);
  }
}

// ---------------------------------------------------------------- hráči
function hasGames(t, pid) {
  return t.roundsData.some((rd) => rd.pairs.some((g) => g.white === pid || g.black === pid) || rd.byes.some((b) => b.player === pid));
}

function renderPlayers() {
  const t = T;
  const R = t.roundsData.length;
  const p = editingPlayer ? playerById(t, editingPlayer) : null;
  const v = (k) => esc(p ? p[k] ?? '' : '');
  view.innerHTML = `
    <section class="card">
      <h2>${p ? `Upravit hráče č. ${p.tpn}` : 'Přidat hráče'}</h2>
      <form id="playerForm" class="grid" autocomplete="off">
        <label class="f" style="grid-column:1/-1">Příjmení a jméno<input name="name" required value="${v('name')}" placeholder="Novák Jan"></label>
        <label class="f">Rating (Elo)<input name="rating" inputmode="numeric" pattern="[0-9]*" value="${p && p.rating ? p.rating : ''}"></label>
        <label class="f">Titul<select name="title"><option value=""></option>${TITLES.map((x) => `<option${p && p.title === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="f">FIDE ID<input name="fideId" inputmode="numeric" value="${v('fideId')}"></label>
        <label class="f">Federace<input name="fed" maxlength="3" value="${v('fed') || (p ? '' : esc(t.fed || ''))}" placeholder="CZE"></label>
        <label class="f">Oddíl<input name="club" value="${v('club')}"></label>
        <label class="f">Datum nebo rok narození<input name="birth" value="${v('birth')}" placeholder="2008"></label>
        <label class="f">Pohlaví<select name="sex"><option value=""></option><option value="m"${p && p.sex === 'm' ? ' selected' : ''}>muž</option><option value="f"${p && p.sex === 'f' ? ' selected' : ''}>žena</option></select></label>
        <div class="row" style="grid-column:1/-1">
          <button class="primary">${p ? 'Uložit' : '＋ Přidat'}</button>
          ${p ? '<button type="button" id="cancelEdit">Zrušit</button>' : ''}
          ${p && !hasGames(t, p.id) ? '<button type="button" class="danger" id="delPlayer">Smazat hráče</button>' : ''}
          ${p && hasGames(t, p.id) ? `<button type="button" id="withdraw">${p.status === 'withdrawn' ? 'Vrátit do turnaje' : `Odstoupil (od ${R + 1}. kola)`}</button>` : ''}
        </div>
      </form>
      ${R ? '<p class="muted small">Hráč přidaný po 1. kole je pozdě přihlášený: za odehraná kola dostane 0 bodů a losuje se od dalšího kola.</p>' : ''}
    </section>
    <section class="card">
      <div class="row between"><h2>Hráči (${t.players.length})</h2>
        <span class="muted small">Startovní čísla podle ratingu, titulu a abecedy (FIDE C.04.2 čl. 2)${t.roundsData.length >= 4 || t.tpnFrozen ? ' – už se nemění' : ''}.</span></div>
      ${t.players.length ? `<div class="table-wrap"><table class="t"><thead><tr><th class="num">SČ</th><th>Jméno</th><th>Tit.</th><th class="num">Rtg</th><th>FIDE ID</th><th>Fed</th><th>Oddíl</th><th>Nar.</th></tr></thead><tbody>
        ${t.players.map((x) => `<tr class="${x.status === 'withdrawn' ? 'withdrawn' : ''}"><td class="num">${x.tpn ?? ''}</td>
          <td class="name"><button class="link" data-edit="${x.id}">${esc(x.name)}</button></td><td>${esc(x.title)}</td><td class="num">${x.rating || ''}</td>
          <td>${esc(x.fideId)}</td><td>${esc(x.fed)}</td><td>${esc(x.club)}</td><td>${esc(x.birth)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Zatím žádní hráči.</p>'}
    </section>
    <section class="card">
      <details>
        <summary>Vložit víc hráčů najednou</summary>
        <p class="muted small">Jeden hráč na řádek: <code>Příjmení Jméno; rating; titul; FIDE ID; federace; oddíl; narození</code>.
          Oddělovat jde středníkem nebo tabulátorem (tedy i vložením z Excelu). Stačí jen jméno.</p>
        <textarea id="bulk" placeholder="Novák Jan; 1850; ; ; CZE; ŠK Praha; 2005"></textarea>
        <div class="row"><button id="bulkAdd" class="primary">Přidat hráče</button></div>
      </details>
    </section>`;
  $('#playerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name').trim(),
      rating: Number(fd.get('rating')) || 0,
      title: fd.get('title'),
      fideId: fd.get('fideId').trim(),
      fed: fd.get('fed').trim().toUpperCase(),
      club: fd.get('club').trim(),
      birth: fd.get('birth').trim(),
      sex: fd.get('sex'),
    };
    if (p) Object.assign(p, data);
    else t.players.push(newPlayer(t, data));
    renumber(t);
    save();
    toast(p ? 'Uloženo' : `Přidán: ${data.name}`);
    editingPlayer = null;
    renderPlayers();
    if (!p) $('#playerForm [name=name]').focus();
  });
  $('#cancelEdit')?.addEventListener('click', () => {
    editingPlayer = null;
    renderPlayers();
  });
  $('#delPlayer')?.addEventListener('click', () => {
    if (!confirm(`Smazat hráče ${p.name}?`)) return;
    t.players = t.players.filter((x) => x.id !== p.id);
    for (const r of Object.keys(t.requests)) delete t.requests[r][p.id];
    editingPlayer = null;
    renumber(t);
    save();
    renderPlayers();
  });
  $('#withdraw')?.addEventListener('click', () => {
    if (p.status === 'withdrawn') {
      p.status = 'active';
      p.withdrawnFrom = null;
    } else {
      p.status = 'withdrawn';
      p.withdrawnFrom = R + 1;
    }
    save();
    editingPlayer = null;
    renderPlayers();
  });
  view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    editingPlayer = Number(b.dataset.edit);
    renderPlayers();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  $('#bulkAdd').addEventListener('click', () => {
    const lines = $('#bulk').value.split('\n').map((l) => l.trim()).filter(Boolean);
    let n = 0;
    for (const line of lines) {
      const c = line.split(/\t|;/).map((x) => x.trim());
      if (!c[0]) continue;
      t.players.push(newPlayer(t, {
        name: c[0],
        rating: Number(c[1]) || 0,
        title: TITLES.includes((c[2] || '').toUpperCase()) ? c[2].toUpperCase() : '',
        fideId: c[3] || '',
        fed: (c[4] || t.fed || '').toUpperCase(),
        club: c[5] || '',
        birth: c[6] || '',
      }));
      n++;
    }
    renumber(t);
    save();
    toast(`Přidáno hráčů: ${n}`);
    renderPlayers();
  });
}

// ---------------------------------------------------------------- kola
function nameOf(id) {
  const p = playerById(T, id);
  return p ? p.name : '?';
}

function renderRounds() {
  const t = T;
  const R = t.roundsData.length;
  const { round } = parseHash();
  const sel = round && round <= R + 1 ? round : R && pendingGames(t, R) ? R : Math.min(R + 1, t.rounds);
  const chips = [];
  for (let r = 1; r <= t.rounds; r++) {
    const paired = r <= R;
    const done = paired && !pendingGames(t, r);
    chips.push(`<button class="chip${done ? ' done' : ''}" aria-pressed="${r === sel}" data-round="${r}" ${r > R + 1 ? 'disabled' : ''}>${r}. kolo</button>`);
  }
  let body = '';
  if (sel <= R) body = roundView(sel);
  else body = pairingView(sel);
  view.innerHTML = `<div class="chips">${chips.join('')}</div>${body}`;
  view.querySelectorAll('[data-round]').forEach((b) => b.addEventListener('click', () => go({ round: Number(b.dataset.round) })));
  if (sel <= R) bindRound(sel);
  else bindPairing(sel);
}

function roundView(r) {
  const t = T;
  const rd = t.roundsData[r - 1];
  const pend = pendingGames(t, r);
  const isLast = r === t.roundsData.length;
  const boards = rd.pairs.map((g, i) => {
    const sw = fmtPts(scoreAfter(t, g.white, r - 1));
    const sb = fmtPts(scoreAfter(t, g.black, r - 1));
    const res = g.result;
    const btn = (code, label) => `<button data-b="${i}" data-res="${code}" aria-pressed="${res === code}" aria-label="${label}">${label}</button>`;
    const forfeit = ['+-', '-+', '--'].includes(res);
    return `<div class="board${res ? ' has-result' : ''}">
      <div class="no">${i + 1}</div>
      <div class="players">
        <div class="pl"><span class="clr w" aria-hidden="true"></span><span class="nm">${esc(nameOf(g.white))}</span><span class="sc">${esc(sw)}</span></div>
        <div class="pl"><span class="clr b" aria-hidden="true"></span><span class="nm">${esc(nameOf(g.black))}</span><span class="sc">${esc(sb)}</span></div>
      </div>
      <div class="res">${btn('1-0', '1–0')}${btn('½-½', '½')}${btn('0-1', '0–1')}
        <button class="more" data-more="${i}" aria-pressed="${forfeit}" aria-label="Kontumace" title="Kontumace">${forfeit ? esc(res.replace('-', ':')) : '⋯'}</button></div>
      <div class="forfeits" data-forfeits="${i}" hidden>
        <span class="muted small">Kontumace:</span>
        <button class="small" data-b="${i}" data-res="+-" aria-pressed="${res === '+-'}">+ : − (bílý)</button>
        <button class="small" data-b="${i}" data-res="-+" aria-pressed="${res === '-+'}">− : + (černý)</button>
        <button class="small" data-b="${i}" data-res="--" aria-pressed="${res === '--'}">− : − (oba)</button>
      </div>
    </div>`;
  }).join('');
  const byes = rd.byes.length
    ? `<div class="byes"><h3>Bez partie</h3><ul>${rd.byes.map((b) => `<li>${esc(nameOf(b.player))} – ${BYE_LABEL[b.type]} (${fmtPts(byePoints(b.type))} b.)</li>`).join('')}</ul></div>`
    : '';
  return `<section class="card">
    <div class="row between"><h2>${r}. kolo</h2>
      <span class="${pend ? 'muted' : ''}">${pend ? `Chybí výsledků: ${pend}` : '<span class="notice ok">Všechny výsledky zadány</span>'}</span></div>
    <div class="boards">${boards}</div>
    ${byes}
    <div class="row" style="margin-top:.8rem">
      <button id="printPairs">🖨 Tisk losování</button>
      ${!pend && r < t.rounds && r === t.roundsData.length ? `<button class="primary" id="toNext">Další kolo →</button>` : ''}
      ${isLast ? '<button class="danger" id="unpair">Zrušit losování tohoto kola</button>' : ''}
    </div>
    ${lastLog && lastLog.round === r ? `<details style="margin-top:.6rem"><summary>Jak losování proběhlo</summary><pre class="log">${esc(lastLog.lines.join('\n'))}</pre></details>` : ''}
  </section>`;
}

function byePoints(type) {
  const pt = T.points;
  return { PAB: pt.pab, HPB: pt.hpb, FPB: pt.fpb, ZPB: pt.zpb }[type] ?? 0;
}

function bindRound(r) {
  const t = T;
  const rd = t.roundsData[r - 1];
  view.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', () => {
    const g = rd.pairs[Number(b.dataset.b)];
    if (r < t.roundsData.length && !confirm('Měníte výsledek kola, po kterém už bylo vylosováno další kolo. Losování dalšího kola zůstane beze změny. Pokračovat?')) return;
    g.result = g.result === b.dataset.res ? null : b.dataset.res;
    save();
    renderRounds();
  }));
  view.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => {
    const box = view.querySelector(`[data-forfeits="${b.dataset.more}"]`);
    box.hidden = !box.hidden;
  }));
  $('#printPairs')?.addEventListener('click', () => printPairings(r));
  $('#toNext')?.addEventListener('click', () => go({ round: r + 1 }));
  $('#unpair')?.addEventListener('click', () => {
    const has = rd.pairs.some((g) => g.result);
    if (!confirm(has ? `Zrušit losování ${r}. kola včetně zadaných výsledků?` : `Zrušit losování ${r}. kola?`)) return;
    t.roundsData.pop();
    if (r === 1 && t.initialColourDrawn) {
      t.initialColour = null;
      t.initialColourDrawn = false;
    }
    save();
    lastLog = null;
    go({ round: r });
  });
}

function pairingView(r) {
  const t = T;
  const R = t.roundsData.length;
  const problems = [];
  if (R && pendingGames(t, R)) problems.push(`Nejdřív zadej všechny výsledky ${R}. kola.`);
  if (t.players.length < 2) problems.push('Turnaj potřebuje aspoň dva hráče.');
  const req = t.requests[r] || {};
  const active = t.players.filter((p) => !(p.status === 'withdrawn' && p.withdrawnFrom <= r));
  const absent = active.filter((p) => req[p.id]);
  const toPair = active.length - absent.length;
  return `<section class="card">
    <h2>Losování ${r}. kola</h2>
    ${problems.map((x) => `<div class="notice warn">${esc(x)}</div>`).join('')}
    <p>Losuje se <strong>${toPair}</strong> hráčů${toPair % 2 ? ' (jeden dostane volno za ' + fmtPts(t.points.pab) + ' b.)' : ''}.
      Systém: holandský systém FIDE (C.04.3, od 1. 2. 2026).</p>
    ${r === 1 ? `<label class="f" style="max-width:22rem">Barva hráče č. 1 v 1. kole (los, čl. 5.1)
        <select id="initColour"><option value="">vylosovat náhodně</option>
        <option value="W"${t.initialColour === 'W' ? ' selected' : ''}>bílá</option><option value="B"${t.initialColour === 'B' ? ' selected' : ''}>černá</option></select></label>` : ''}
    <details style="margin:.8rem 0"${absent.length ? ' open' : ''}>
      <summary>Hráči, kteří ${r}. kolo nehrají (${absent.length})</summary>
      <p class="muted small">Volno na žádost a omluvené absence. Kdo nehraje, nebude vylosován (C.04.2 čl. 3.3).</p>
      <div class="table-wrap"><table class="t"><tbody>
        ${active.map((p) => `<tr><td class="num">${p.tpn}</td><td>${esc(p.name)}</td><td style="width:12rem">
          <select data-req="${p.id}" aria-label="Účast hráče ${esc(p.name)}">
            <option value="">hraje</option>
            <option value="HPB"${req[p.id] === 'HPB' ? ' selected' : ''}>volno za ${fmtPts(t.points.hpb)} b.</option>
            <option value="ZPB"${req[p.id] === 'ZPB' ? ' selected' : ''}>nehraje (0 b.)</option>
            <option value="FPB"${req[p.id] === 'FPB' ? ' selected' : ''}>volno za ${fmtPts(t.points.fpb)} b.</option>
          </select></td></tr>`).join('')}
      </tbody></table></div>
    </details>
    <button class="primary" id="doPair" ${problems.length ? 'disabled' : ''}>Vylosovat ${r}. kolo</button>
  </section>`;
}

function bindPairing(r) {
  const t = T;
  $('#initColour')?.addEventListener('change', (e) => {
    t.initialColour = e.target.value || null;
    t.initialColourDrawn = false;
    save();
  });
  view.querySelectorAll('[data-req]').forEach((s) => s.addEventListener('change', () => {
    const req = (t.requests[r] ||= {});
    if (s.value) req[s.dataset.req] = s.value;
    else delete req[s.dataset.req];
    save();
    renderRounds();
  }));
  $('#doPair')?.addEventListener('click', () => {
    const drawn = !t.initialColour;
    const btn = $('#doPair');
    btn.disabled = true;
    btn.textContent = 'Losuji…';
    setTimeout(() => {
      try {
        const res = pairNextRound(t, { random: secureRandom });
        if (drawn) t.initialColourDrawn = true;
        lastLog = { round: res.round, lines: res.log };
        save();
        toast(`${res.round}. kolo vylosováno${drawn ? ` (č. 1 hraje ${t.initialColour === 'W' ? 'bílými' : 'černými'})` : ''}`);
        go({ round: res.round });
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        btn.textContent = `Vylosovat ${r}. kolo`;
      }
    }, 20);
  });
}

function secureRandom() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  } catch {
    return Math.random();
  }
}

// ---------------------------------------------------------------- pořadí
function standingsRows(after) {
  return computeStandings(T, after);
}

function rankLabel(rows, i) {
  const r = rows[i];
  if (!r.tied) return `${r.rank}.`;
  const same = rows.filter((x) => x.rank === r.rank).length;
  return same > 1 ? `${r.rank}.–${r.rank + same - 1}.` : `${r.rank}.`;
}

function fmtTb(code, v) {
  if (['ARO', 'ARO-C1', 'TPR', 'RTNG'].includes(code)) return v ? String(v) : '';
  if (code === 'TPN') return String(-v);
  return fmtPts(v);
}

function renderStandings() {
  const t = T;
  const R = t.roundsData.length;
  const done = R && pendingGames(t, R) ? R - 1 : R;
  const { after } = parseHash();
  const upTo = after && after <= R ? after : done;
  const codes = t.tiebreaks.filter((c) => TIEBREAKS[c]);
  const rows = upTo ? standingsRows(upTo) : [];
  view.innerHTML = `<section class="card">
    <div class="row between"><h2>Pořadí po ${upTo}. kole</h2>
      <label class="row small">po kole <select id="after">${Array.from({ length: R }, (_, i) => `<option${i + 1 === upTo ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label></div>
    ${!upTo ? '<p class="muted">Pořadí bude po prvním kole.</p>' : `
    <div class="table-wrap"><table class="t"><thead><tr><th class="num">Poř.</th><th class="num">SČ</th><th>Jméno</th><th class="num">Rtg</th><th class="num">Body</th>
      ${codes.map((c) => `<th class="num" title="${esc(TIEBREAKS[c].label)} – ${esc(TIEBREAKS[c].help)}">${esc(TIEBREAKS[c].short)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.player.status === 'withdrawn' ? 'withdrawn' : ''}"><td class="num">${rankLabel(rows, i)}</td><td class="num">${r.player.tpn}</td><td class="name">${esc(r.player.name)}</td>
        <td class="num">${r.player.rating || ''}</td><td class="num"><strong>${fmtPts(r.score)}</strong></td>
        ${codes.map((c) => `<td class="num">${c === 'DE' ? (r.deUsed ? '✓' : '') : esc(fmtTb(c, r.tb[c]))}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">Pomocná hodnocení v tomto pořadí: ${codes.map((c) => esc(TIEBREAKS[c].label)).join(' → ')}${codes.length ? ' → ' : ''}los.
      Neodehraná kola podle FIDE C.07 čl. 16. ${rows.some((r) => r.tied) ? 'Stejné umístění znamená, že shodu nerozhodlo žádné hodnocení.' : ''}</p>
    <div class="row"><button id="printSt">🖨 Tisk pořadí</button></div>`}
  </section>`;
  $('#after')?.addEventListener('change', (e) => go({ after: Number(e.target.value) }));
  $('#printSt')?.addEventListener('click', () => printStandings(upTo, rows, codes));
}

// ---------------------------------------------------------------- tabulka
function crossCell(t, pid, r) {
  const rec = roundRecord(t, pid, r);
  if (!rec) return '';
  if (rec.opp) {
    const opp = playerById(t, rec.opp);
    let res = '';
    if (rec.pending) res = '';
    else if (rec.kind === 'forfeitWin') res = '+';
    else if (rec.kind === 'forfeitLoss') res = '−';
    else res = rec.points === t.points.win ? '1' : rec.points === t.points.draw ? '½' : '0';
    return `${opp?.tpn ?? '?'}${rec.colour === 'W' ? 'b' : 'č'}${res}`;
  }
  return { PAB: 'volno', HPB: '½ vol.', FPB: '1 vol.', ZPB: '–', absent: '–' }[rec.kind] || '';
}

function renderCross() {
  const t = T;
  const R = t.roundsData.length;
  const rows = R ? standingsRows(R) : t.players.map((player) => ({ player, score: 0, rank: player.tpn }));
  view.innerHTML = `<section class="card">
    <h2>Tabulka</h2>
    <p class="muted small">V buňce: startovní číslo soupeře, barva (b = bílé, č = černé) a výsledek. Řazeno podle pořadí.</p>
    <div class="table-wrap"><table class="t cross"><thead><tr><th class="num">Poř.</th><th class="num">SČ</th><th class="name">Jméno</th>
      ${Array.from({ length: R }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>Body</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="num">${r.rank}.</td><td class="num">${r.player.tpn}</td><td class="name">${esc(r.player.name)}</td>
        ${Array.from({ length: R }, (_, i) => `<td class="nowrap">${esc(crossCell(t, r.player.id, i + 1))}</td>`).join('')}
        <td><strong>${fmtPts(r.score)}</strong></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row" style="margin-top:.6rem"><button id="printCross">🖨 Tisk tabulky</button></div>
  </section>`;
  $('#printCross').addEventListener('click', () => {
    printHtml(`<h2>Tabulka</h2>${view.querySelector('table').outerHTML}`);
  });
}

// ---------------------------------------------------------------- nastavení
function renderSettings() {
  const t = T;
  const R = t.roundsData.length;
  const codes = t.tiebreaks;
  const avail = Object.keys(TIEBREAKS).filter((c) => !codes.includes(c));
  view.innerHTML = `
    <section class="card">
      <h2>Turnaj</h2>
      <form id="setForm" class="grid">
        <label class="f" style="grid-column:1/-1">Název<input name="name" value="${esc(t.name)}" required></label>
        <label class="f">Místo<input name="city" value="${esc(t.city)}"></label>
        <label class="f">Federace<input name="fed" value="${esc(t.fed)}" maxlength="3"></label>
        <label class="f">Od<input type="date" name="dateFrom" value="${esc(t.dateFrom)}"></label>
        <label class="f">Do<input type="date" name="dateTo" value="${esc(t.dateTo)}"></label>
        <label class="f">Hlavní rozhodčí<input name="arbiter" value="${esc(t.arbiter)}"></label>
        <label class="f">Zástupce hlavního rozhodčího<input name="deputy" value="${esc(t.deputy)}"></label>
        <label class="f">Pořadatel<input name="organizer" value="${esc(t.organizer)}"></label>
        <label class="f">Tempo hry<input name="timeControl" value="${esc(t.timeControl)}" placeholder="90 min/40 tahů + 30 min + 30 s/tah"></label>
        <label class="f">Počet kol<input type="number" name="rounds" min="${Math.max(1, R)}" max="30" value="${t.rounds}"></label>
        <label class="f">Body za volno z losování (PAB)<select name="pab"${R ? ' disabled' : ''}>
          ${[1, 0.5, 0].map((x) => `<option value="${x}"${t.points.pab === x ? ' selected' : ''}>${fmtPts(x)}</option>`).join('')}</select></label>
        <label class="f">Body za půlbodové volno na žádost<select name="hpb">
          ${[0.5, 0, 1].map((x) => `<option value="${x}"${t.points.hpb === x ? ' selected' : ''}>${fmtPts(x)}</option>`).join('')}</select></label>
        <div class="row" style="grid-column:1/-1"><button class="primary">Uložit</button></div>
      </form>
    </section>
    <section class="card">
      <h2>Pomocná hodnocení</h2>
      <p class="muted small">Pořadí, ve kterém rozhodují shodu bodů. Výchozí je Soutěžní řád ŠSČR čl. 5.2.3:
        vzájemné partie, Buchholz bez nejhoršího, Buchholz, Sonneborn-Berger, více partií černými, los.
        Výpočet podle FIDE C.07 (od 1. 3. 2026).</p>
      <ol class="tb-list">${codes.map((c, i) => `<li><span class="lbl">${i + 1}. ${esc(TIEBREAKS[c]?.label || c)} <span class="muted small">${esc(TIEBREAKS[c]?.help || '')}</span></span>
        <button class="small" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Výš">↑</button>
        <button class="small" data-down="${i}" ${i === codes.length - 1 ? 'disabled' : ''} aria-label="Níž">↓</button>
        <button class="small" data-rm="${i}" aria-label="Odebrat">✕</button></li>`).join('')}</ol>
      <div class="row">
        <select id="tbAdd" style="max-width:20rem"><option value="">Přidat hodnocení…</option>${avail.map((c) => `<option value="${c}">${esc(TIEBREAKS[c].label)}</option>`).join('')}</select>
        <button id="tbPreset">Podle Soutěžního řádu ŠSČR</button>
      </div>
    </section>
    <section class="card">
      <h2>Smazat turnaj</h2>
      <p class="muted small">Smaže turnaj z tohoto zařízení. Předtím si můžete stáhnout zálohu v části Export.</p>
      <button class="danger" id="delT">Smazat turnaj</button>
    </section>`;
  $('#setForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    for (const k of ['name', 'city', 'dateFrom', 'dateTo', 'arbiter', 'deputy', 'organizer', 'timeControl']) t[k] = fd.get(k).trim();
    t.fed = fd.get('fed').trim().toUpperCase();
    t.rounds = Math.max(R, Math.min(30, Number(fd.get('rounds')) || t.rounds));
    if (!R) t.points.pab = Number(fd.get('pab'));
    t.points.hpb = Number(fd.get('hpb'));
    save();
    toast('Uloženo');
    render();
  });
  const move = (i, d) => {
    const a = t.tiebreaks;
    [a[i], a[i + d]] = [a[i + d], a[i]];
    save();
    renderSettings();
  };
  view.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.up), -1)));
  view.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.down), 1)));
  view.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    t.tiebreaks.splice(Number(b.dataset.rm), 1);
    save();
    renderSettings();
  }));
  $('#tbAdd').addEventListener('change', (e) => {
    if (!e.target.value) return;
    t.tiebreaks.push(e.target.value);
    save();
    renderSettings();
  });
  $('#tbPreset').addEventListener('click', () => {
    t.tiebreaks = [...TIEBREAKS_SR_SWISS];
    save();
    renderSettings();
  });
  $('#delT').addEventListener('click', () => {
    if (!confirm(`Opravdu smazat turnaj „${t.name}“ z tohoto zařízení?`)) return;
    deleteTournament(t.id);
    T = null;
    location.hash = '';
  });
}

// ---------------------------------------------------------------- export
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

const fileBase = () => (T.name || 'turnaj').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 50);

function renderExport() {
  view.innerHTML = `
    <section class="card">
      <h2>Zpráva pro FIDE (TRF)</h2>
      <p class="muted small">Soubor TRF-16 se všemi hráči a výsledky. Hodí se pro zápočet na FIDE a pro kontrolu losování
        nezávislým programem (např. bbpPairings nebo JaVaFo v režimu kontroly).</p>
      <button class="primary" id="dlTrf">Stáhnout TRF</button>
    </section>
    <section class="card">
      <h2>Záloha</h2>
      <p class="muted small">Celý turnaj v jednom souboru. Na jiném zařízení ho načtete na úvodní stránce.</p>
      <button id="dlJson">Stáhnout zálohu (.json)</button>
    </section>
    <section class="card">
      <h2>O losování</h2>
      <p class="small">Losování se řídí pravidly FIDE C.04.1, C.04.2 a C.04.3 (holandský systém) ve znění platném od 1. 2. 2026.
        Program není na seznamu programů schválených FIDE (C.04.2 čl. 1.4). U turnajů započítávaných na FIDE proto doporučujeme
        losování ověřit nezávislým programem; soubor TRF k tomu stačí.</p>
    </section>`;
  $('#dlTrf').addEventListener('click', () => download(`${fileBase()}.trf`, tournamentToTRF(T), 'text/plain;charset=utf-8'));
  $('#dlJson').addEventListener('click', () => download(`${fileBase()}.json`, JSON.stringify(T, null, 1), 'application/json'));
}

// ---------------------------------------------------------------- tisk
function printHeader() {
  const t = T;
  const dates = [t.dateFrom, t.dateTo].filter(Boolean).map((d) => new Date(d).toLocaleDateString('cs-CZ')).join(' – ');
  return `<h1>${esc(t.name)}</h1><div class="small">${esc([t.city, dates].filter(Boolean).join(', '))}</div>`;
}

function printHtml(inner) {
  const t = T;
  $('#print').innerHTML = `${printHeader()}${inner}
    <div class="foot">Hlavní rozhodčí: ${esc(t.arbiter || '—')} · Vytištěno ${esc(new Date().toLocaleString('cs-CZ'))}</div>`;
  window.print();
}

function printPairings(r) {
  const t = T;
  const rd = t.roundsData[r - 1];
  const rows = rd.pairs.map((g, i) => `<tr><td class="num">${i + 1}</td><td class="num">${playerById(t, g.white)?.tpn}</td><td>${esc(nameOf(g.white))}</td>
    <td class="num">${fmtPts(scoreAfter(t, g.white, r - 1))}</td><td style="text-align:center">${esc(g.result || '–')}</td>
    <td class="num">${fmtPts(scoreAfter(t, g.black, r - 1))}</td><td>${esc(nameOf(g.black))}</td><td class="num">${playerById(t, g.black)?.tpn}</td></tr>`).join('');
  const byes = rd.byes.map((b) => `<tr><td></td><td class="num">${playerById(t, b.player)?.tpn}</td><td>${esc(nameOf(b.player))}</td><td></td>
    <td colspan="4">${BYE_LABEL[b.type]} (${fmtPts(byePoints(b.type))} b.)</td></tr>`).join('');
  printHtml(`<h2>${r}. kolo – losování</h2><table><thead><tr><th class="num">Š.</th><th class="num">SČ</th><th>Bílý</th><th class="num">B.</th>
    <th style="text-align:center">Výsledek</th><th class="num">B.</th><th>Černý</th><th class="num">SČ</th></tr></thead><tbody>${rows}${byes}</tbody></table>`);
}

function printStandings(upTo, rows, codes) {
  const head = codes.map((c) => `<th class="num">${esc(TIEBREAKS[c].short)}</th>`).join('');
  const body = rows.map((r, i) => `<tr><td class="num">${rankLabel(rows, i)}</td><td class="num">${r.player.tpn}</td><td>${esc(r.player.title)} ${esc(r.player.name)}</td>
    <td>${esc(r.player.club || r.player.fed)}</td><td class="num">${r.player.rating || ''}</td><td class="num">${fmtPts(r.score)}</td>
    ${codes.map((c) => `<td class="num">${c === 'DE' ? (r.deUsed ? '✓' : '') : esc(fmtTb(c, r.tb[c]))}</td>`).join('')}</tr>`).join('');
  const legend = codes.map((c) => `${esc(TIEBREAKS[c].short)} = ${esc(TIEBREAKS[c].label)}`).join(', ');
  printHtml(`<h2>Pořadí po ${upTo}. kole</h2><table><thead><tr><th class="num">Poř.</th><th class="num">SČ</th><th>Jméno</th><th>Oddíl</th><th class="num">Rtg</th><th class="num">Body</th>${head}</tr></thead>
    <tbody>${body}</tbody></table><div class="foot">${legend}</div>`);
}

// ---------------------------------------------------------------- start
window.addEventListener('hashchange', () => {
  editingPlayer = null;
  render();
  view.focus({ preventScroll: true });
});
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../sw.js').catch(() => {});
}

// pro ladění v konzoli
export { isAvailable, RESULTS, POINTS_DEFAULT };
