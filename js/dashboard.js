// Dashboard: vlevo a vpravo los aktuálního kola dvou turnajů z chess-results.com.
//
// chess-results nepovoluje čtení z cizích stránek (CORS), proto los stahuje úloha na GitHubu
// (.github/workflows/dashboard.yml) a ukládá ho do větve dashboard-data. Odtud ho stránka čte
// každou minutu. Turnaj, který úloha nestahuje, se ukáže přímo jako stránka chess-results.
//
// Parametry adresy:
//   ?vlevo=1516901&vpravo=1507857   turnaje (číslo nebo odkaz); bez nich se vezmou ze stahování
//   ?tema=svetle                    světlý vzhled
//   ?data=<adresa>                  jiný zdroj dat (pro vývoj)

import { parseTournamentInput, publicUrl } from './pairings.js';

const REPO = 'slivam24/zapis-o-utkani';
const REFRESH_MS = 60_000;
const STALE_MIN = 25;
const IDLE_MS = 4000;
const SCROLL_PX_S = 28;
const SCROLL_PAUSE_MS = 5000;

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

if (/^(svetle|světlé|light)$/i.test(params.get('tema') || '')) document.documentElement.dataset.theme = 'light';

function repoSlug() {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
  const first = location.pathname.split('/').filter(Boolean)[0];
  return m && first && !first.endsWith('.html') ? `${m[1]}/${first}` : REPO;
}
const SLUG = repoSlug();
const DATA_URL = params.get('data') || `https://raw.githubusercontent.com/${SLUG}/dashboard-data/dashboard.json`;
const WORKFLOW_URL = `https://github.com/${SLUG}/actions/workflows/dashboard.yml`;

let data = null;
let lastJson = '';
let lastOk = null;
let lastError = null;

const chosen = () => ({
  vlevo: parseTournamentInput(params.get('vlevo') || '') || data?.vlevo || null,
  vpravo: parseTournamentInput(params.get('vpravo') || '') || data?.vpravo || null,
});

// ---------- pomocné ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtPts = (p) => (p == null ? '' : `${Math.floor(p) || (p % 1 ? '' : '0')}${p % 1 ? '½' : ''}`);

const DAYS = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return `${DAYS[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}
const hhmm = (d) => d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

/** Kdo vyhrál: 1 bílý / domácí, -1 černý / hosté, 0 remíza nebo nehráno. */
function winner(result) {
  const m = /^\s*([\d½K+\-]+)\s*[–:-]\s*([\d½K+\-]+)\s*$/.exec(result || '');
  if (!m) return 0;
  const val = (s) => (s.startsWith('+') ? 1 : s.startsWith('-') ? 0 : parseFloat(s.replace('½', '.5').replace(/^\./, '0.').replace('K', '')) || 0);
  const a = val(m[1]);
  const b = val(m[2]);
  return a > b ? 1 : a < b ? -1 : 0;
}

// ---------- vykreslení ----------

function headHtml(t, tnr) {
  const parts = [];
  if (t?.round) parts.push(`<span class="round">${t.round}. kolo${t.rounds ? ` z ${t.rounds}` : ''}</span>`);
  if (t?.date) parts.push(`${fmtDate(t.date)}${t.time ? ` ${t.time}` : ''}`);
  const flag = t?.error ? `<span class="flag" title="${esc(t.error)}">⚠ poslední stažení selhalo</span>` : '';
  return `<div class="head">
    <h1 class="title">${esc(t?.title || `Turnaj ${tnr}`)}</h1>
    <div class="sub">${parts.join(' · ')}${flag}</div>
  </div>`;
}

function playerHtml(p, side) {
  if (!p || p.bye) return `<span class="bye">volno</span>`;
  const ttl = p.title ? `<span class="ttl">${esc(p.title)}</span>` : '';
  const metaParts = [p.rating, p.points != null ? `${fmtPts(p.points)} b.` : ''].filter(Boolean);
  const meta = metaParts.length ? `<span class="meta">${esc(metaParts.join(' · '))}</span>` : '';
  const piece = `<span class="piece ${side}" aria-hidden="true"></span>`;
  // kolečko barvy drží u jména, aby se při zalomení neoctlo samo na řádku
  const words = esc(p.name).split(' ');
  const line =
    side === 'w'
      ? `<span class="nb">${piece}${ttl}<span class="name">${words[0]}</span></span> <span class="name">${words.slice(1).join(' ')}</span>`
      : `${ttl}<span class="name">${words.slice(0, -1).join(' ')}</span> <span class="nb"><span class="name">${words.at(-1)}</span>${piece}</span>`;
  return `<div class="pc"><span class="line">${line}</span>${meta}</div>`;
}

function individualTable(t) {
  const rows = t.pairings
    .map((g) => {
      const w = winner(g.result);
      return `<tr>
        <td class="bd">${esc(g.board)}</td>
        <td class="pl${w === 1 ? ' win' : ''}">${playerHtml(g.white, 'w')}</td>
        <td class="res${g.result ? '' : ' empty'}">${esc(g.result || '–')}</td>
        <td class="pl right${w === -1 ? ' win' : ''}">${playerHtml(g.black, 'b')}</td>
      </tr>`;
    })
    .join('');
  return `<table class="pairs"><tbody>${rows}</tbody></table>`;
}

function teamTable(t) {
  const rows = t.matches
    .map((m) => {
      const w = winner(m.result);
      return `<tr>
        <td class="bd">${esc(m.board)}</td>
        <td class="pl${w === 1 ? ' win' : ''}"><div class="pc"><span class="line"><span class="name">${esc(m.home.name)}</span></span></div></td>
        <td class="res${m.result ? '' : ' empty'}">${esc(m.result || '–')}</td>
        <td class="pl right${w === -1 ? ' win' : ''}"><div class="pc"><span class="line"><span class="name">${esc(m.away.name)}</span></span></div></td>
      </tr>`;
    })
    .join('');
  return `<table class="pairs team"><tbody>${rows}</tbody></table>`;
}

function frameHtml(tnr, why) {
  return `<div class="frame-wrap">
    <div class="frame-note">${why} Zobrazuji přímo stránku chess-results.
      Přehledné zobrazení: zadej turnaj v <a href="${WORKFLOW_URL}" target="_blank" rel="noopener">Actions → Dashboard → Run workflow</a>.</div>
    <iframe src="${esc(publicUrl(tnr))}" title="chess-results.com, turnaj ${tnr}" referrerpolicy="no-referrer"></iframe>
  </div>`;
}

const panelState = new WeakMap();

function renderPanel(el, tnr) {
  const t = tnr ? data?.tournaments?.[tnr] : null;
  let html;
  let table = false;
  if (!tnr) {
    html = `<div class="empty-state"><strong>Není vybraný turnaj</strong>
      <span>Klikni na ⚙ Turnaje a zadej číslo nebo odkaz z chess-results.com.</span></div>`;
  } else if (t?.pairings?.length || t?.matches?.length) {
    html = `${headHtml(t, tnr)}<div class="body"><div class="scroller">${t.kind === 'team' ? teamTable(t) : individualTable(t)}</div></div>`;
    table = true;
  } else if (!data) {
    html = `<div class="empty-state"><span>Načítám los…</span></div>`;
  } else if (t?.error) {
    html = headHtml(t, tnr) + frameHtml(tnr, `Los se nepodařilo stáhnout (${esc(t.error)}).`);
  } else {
    html = frameHtml(tnr, 'Tento turnaj se zatím nestahuje.');
  }
  const prev = panelState.get(el);
  if (prev?.html === html) return;
  el.innerHTML = html;
  panelState.set(el, { html, table });
  if (table) {
    fit(el);
    document.fonts?.ready.then(() => fit(el));
  }
}

function render() {
  const { vlevo, vpravo } = chosen();
  renderPanel($('panelL'), vlevo);
  renderPanel($('panelR'), vpravo);
  renderStatus();
}

function renderStatus() {
  const s = [];
  if (data?.generated) {
    const gen = new Date(data.generated);
    const age = Math.round((Date.now() - gen) / 60000);
    const txt = `Los stažen z chess-results v ${hhmm(gen)}`;
    s.push(age > STALE_MIN ? `<span class="warn">⚠ ${txt} (před ${age} min)</span>` : txt);
  }
  if (lastError) s.push(`<span class="bad">⚠ nelze načíst data${lastOk ? `, naposledy v ${hhmm(lastOk)}` : ''}</span>`);
  $('status').innerHTML = s.join(' · ');
}

// ---------- přizpůsobení velikosti ----------

/**
 * Největší písmo, při kterém se los vejde na výšku a nic nepřetéká do strany.
 * Zkouší tři rozložení: vše na řádku; rating a body pod jménem; k tomu zalomená dlouhá jména.
 * Bohatší rozložení vyhraje, jen když dovolí znatelně větší písmo.
 */
const LAYOUTS = ['', 'stack', 'stack wrap'];
function fit(panel) {
  const body = panel.querySelector('.body');
  const table = panel.querySelector('table.pairs');
  if (!body || !table) return;
  const scroller = body.querySelector('.scroller');
  stopScroll(panel);
  scroller.style.transform = '';
  const H = body.clientHeight;
  const noOverflow = () => {
    for (const n of table.querySelectorAll('.pl, .res, .line')) if (n.scrollWidth > n.clientWidth + 1) return false;
    if (table.classList.contains('wrap')) {
      // nejvýš dva řádky na jméno
      const max = parseFloat(table.style.fontSize) * 1.15 * 2 + 2;
      for (const n of table.querySelectorAll('.line')) if (n.offsetHeight > max) return false;
    }
    return true;
  };
  const best = (heightOnly) => {
    let lo = 0;
    let hi = Math.min(80, Math.max(14, H / 4));
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      table.style.fontSize = `${mid}px`;
      if (table.offsetHeight <= H && (heightOnly || noOverflow())) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const setLayout = (l) => {
    table.classList.remove('stack', 'wrap');
    if (l) table.classList.add(...l.split(' '));
  };
  let pick = { layout: '', size: 0 };
  for (const l of LAYOUTS) {
    setLayout(l);
    const size = best(false);
    // bohatší rozložení musí dovolit znatelně větší písmo, zalomení ještě o něco víc
    if (size > pick.size * (l.includes('wrap') ? 1.3 : 1.15)) pick = { layout: l, size };
  }
  const MIN = 16;
  if (pick.size < MIN) {
    // hodně šachovnic: raději čitelné písmo s posouváním, zkrácená jména nevadí tolik
    setLayout('');
    const size = best(true);
    pick = { layout: '', size: Math.max(MIN, size) };
  }
  setLayout(pick.layout);
  table.style.fontSize = `${pick.size}px`;
  if (table.offsetHeight > H + 2) startScroll(panel, scroller, table.offsetHeight - H);
}

const scrolls = new WeakMap();
function stopScroll(panel) {
  const s = scrolls.get(panel);
  if (s) cancelAnimationFrame(s.raf);
  scrolls.delete(panel);
}
function startScroll(panel, scroller, distance) {
  const s = { raf: 0 };
  scrolls.set(panel, s);
  const travel = (distance / SCROLL_PX_S) * 1000;
  const cycle = SCROLL_PAUSE_MS + travel + SCROLL_PAUSE_MS + 600;
  const t0 = performance.now();
  const step = (now) => {
    const t = (now - t0) % cycle;
    let y;
    if (t < SCROLL_PAUSE_MS) y = 0;
    else if (t < SCROLL_PAUSE_MS + travel) y = ((t - SCROLL_PAUSE_MS) / travel) * distance;
    else if (t < cycle - 600) y = distance;
    else y = distance * (1 - (t - (cycle - 600)) / 600);
    scroller.style.transform = `translateY(${-y}px)`;
    s.raf = requestAnimationFrame(step);
  };
  s.raf = requestAnimationFrame(step);
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const p of [$('panelL'), $('panelR')]) if (panelState.get(p)?.table) fit(p);
  }, 150);
});

// ---------- data ----------

async function load() {
  try {
    const sep = DATA_URL.includes('?') ? '&' : '?';
    const res = await fetch(`${DATA_URL}${sep}t=${Math.floor(Date.now() / 30000)}`, { cache: 'no-store' });
    if (res.status === 404) throw new Error('data zatím nejsou (úloha Dashboard ještě neběžela)');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    lastOk = new Date();
    lastError = null;
    if (text !== lastJson) {
      lastJson = text;
      data = JSON.parse(text);
    }
  } catch (e) {
    lastError = e.message;
    if (!data) data = { tournaments: {} };
  }
  render();
}

// ---------- hodiny, celá obrazovka, nečinnost ----------

function tick() {
  $('clock').textContent = hhmm(new Date());
}
setInterval(tick, 1000);
tick();
setInterval(renderStatus, 30_000);

const isFull = () => !!document.fullscreenElement;
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    /* zařízení to nepovolí, nevadí */
  }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && keepAwake());

async function toggleFull() {
  try {
    if (isFull()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* prohlížeč celou obrazovku nepovolil */
  }
  $('start').hidden = true;
  keepAwake();
}
document.addEventListener('fullscreenchange', () => {
  $('btnFull').textContent = isFull() ? '✕ Zavřít celou obrazovku' : '⛶ Celá obrazovka';
});

$('btnFull').addEventListener('click', toggleFull);
$('btnStart').addEventListener('click', toggleFull);
$('btnStay').addEventListener('click', () => {
  $('start').hidden = true;
  keepAwake();
});
// celá obrazovka se dá zapnout jen po kliknutí, proto úvodní nabídka (kromě ?start=ne)
if (!/^(ne|no|0)$/i.test(params.get('start') || '') && document.fullscreenEnabled) $('start').hidden = false;

let idleTimer;
function active() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!$('settings').open) document.body.classList.add('idle');
  }, IDLE_MS);
}
['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, active, { passive: true }));
active();

document.addEventListener('keydown', (e) => {
  if ($('settings').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') toggleFull();
  if (e.key === 's' || e.key === 'S') openSettings();
});

// ---------- nastavení ----------

function openSettings() {
  const c = chosen();
  $('inL').value = c.vlevo || '';
  $('inR').value = c.vpravo || '';
  $('settingsErr').textContent = '';
  const known = data?.vlevo || data?.vpravo ? `Stahují se turnaje <b>${data.vlevo ?? '–'}</b> a <b>${data.vpravo ?? '–'}</b>.` : '';
  $('settingsNote').innerHTML = `${known}
    Jiný turnaj se tu ukáže hned, ale jen jako stránka chess-results. Aby byl v přehledném
    zobrazení, zadej ho na GitHubu v <a href="${WORKFLOW_URL}" target="_blank" rel="noopener">Actions → Dashboard → Run workflow</a>
    (los se pak obnovuje každých 10 minut). Odkaz na tuto stránku si turnaje pamatuje, dá se uložit do záložek.`;
  $('settings').showModal();
}

$('btnSettings').addEventListener('click', openSettings);
$('btnCancel').addEventListener('click', () => $('settings').close());
$('btnDefault').addEventListener('click', () => {
  params.delete('vlevo');
  params.delete('vpravo');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  $('settings').close();
  render();
});
$('settingsForm').addEventListener('submit', (e) => {
  const l = $('inL').value.trim();
  const r = $('inR').value.trim();
  const nl = l ? parseTournamentInput(l) : null;
  const nr = r ? parseTournamentInput(r) : null;
  if ((l && !nl) || (r && !nr)) {
    e.preventDefault();
    $('settingsErr').textContent = 'Zadej číslo turnaje nebo odkaz na stránku turnaje na chess-results.com.';
    return;
  }
  nl ? params.set('vlevo', nl) : params.delete('vlevo');
  nr ? params.set('vpravo', nr) : params.delete('vpravo');
  history.replaceState(null, '', `${location.pathname}?${params}`);
  render();
});

load();
setInterval(load, REFRESH_MS);
