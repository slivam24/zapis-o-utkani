// Kreslení zápisu na plátno (A4). Stejný kód běží v prohlížeči i v Node (testy),
// proto se plátno a načítání obrázků předávají zvenku (env).
import {
  RESULTS, REFEREE_ROLES, sortedLineup, boardResult, totals, fmtPoints, fmtDate, fmtRating,
  typeLabel, restrictedCount, maxRestricted, homeIsWhite, ratingColumns, matchBoards,
} from './logic.js';

export const PAGE_W = 794; // A4 při 96 dpi
export const PAGE_H = 1123;
// do PDF jen písma, která jsou všude: na iOS, Androidu i v prohlížečích na počítači
const FONT = 'Helvetica, Arial, "Liberation Sans", "DejaVu Sans", sans-serif';
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#9ca3af';
const STRONG = '#374151';
const SHADE = '#f3f4f6';

const MX = 36; // okraj
const CW = PAGE_W - 2 * MX; // šířka obsahu

function font(ctx, size, weight = 'normal') {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

/** Zmenší písmo tak, aby se text vešel do šířky `w`. */
function fitText(ctx, text, x, y, w, { size = 11, min = 7, weight = 'normal', align = 'left', color = INK } = {}) {
  let s = size;
  font(ctx, s, weight);
  while (s > min && ctx.measureText(text).width > w) {
    s -= 0.5;
    font(ctx, s, weight);
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  let t = text;
  if (ctx.measureText(t).width > w) {
    while (t.length > 1 && ctx.measureText(`${t}…`).width > w) t = t.slice(0, -1);
    t = `${t}…`;
  }
  const px = align === 'left' ? x : align === 'right' ? x + w : x + w / 2;
  ctx.fillText(t, px, y);
}

function rect(ctx, x, y, w, h, { fill, stroke = LINE, lw = 0.8, r = 0 } = {}) {
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function hline(ctx, x1, x2, y, color = LINE, lw = 0.6) {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function vline(ctx, x, y1, y2, color = LINE, lw = 0.6) {
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function wrapLines(ctx, text, width) {
  const out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= width) line = test;
      else {
        if (line) out.push(line);
        // příliš dlouhé slovo rozdělíme
        let w = word;
        while (ctx.measureText(w).width > width && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > width) cut--;
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

function labeledBox(ctx, label, value, x, y, w) {
  font(ctx, 8, 'normal');
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label.toUpperCase(), x + 1, y);
  rect(ctx, x, y + 4, w, 24, { r: 3 });
  fitText(ctx, value ?? '', x + 7, y + 16.5, w - 14, { size: 12, weight: 'bold' });
}

async function drawSignature(ctx, env, dataUrl, x, y, w, h) {
  if (!dataUrl) return;
  try {
    const img = await env.loadImage(dataUrl);
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } catch {
    /* podpis se nepodařilo načíst, pole zůstane prázdné */
  }
}

async function drawSignatures(ctx, env, state, y0) {
  const gap = 14;
  const bw = (CW - 2 * gap) / 3;
  font(ctx, 10, 'bold');
  ctx.fillStyle = STRONG;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Správnost zápisu potvrzují', PAGE_W / 2, y0);
  const boxes = [
    { key: 'home', role: 'kapitán domácího družstva', name: state.home.captain },
    { key: 'ref', role: 'rozhodčí', name: state.referee?.name },
    { key: 'away', role: 'kapitán hostujícího družstva', name: state.away.captain },
  ];
  const top = y0 + 10;
  const h = 100;
  for (let i = 0; i < boxes.length; i++) {
    const x = MX + i * (bw + gap);
    rect(ctx, x, top, bw, h, { r: 4 });
    await drawSignature(ctx, env, state.sig?.[boxes[i].key], x + 6, top + 4, bw - 12, h - 34);
    hline(ctx, x + 10, x + bw - 10, top + h - 28, LINE, 0.6);
    fitText(ctx, boxes[i].name ?? '', x + 8, top + h - 17, bw - 16, { size: 10, weight: 'bold', align: 'center' });
    fitText(ctx, boxes[i].role, x + 8, top + h - 7, bw - 16, { size: 8, color: MUTED, align: 'center' });
  }
}

function footer(ctx, pageNo, pageCount, state) {
  font(ctx, 7.5, 'normal');
  ctx.fillStyle = MUTED;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const stamp = new Date(state.updatedAt || Date.now()).toLocaleString('cs-CZ');
  ctx.fillText(`Zápis vyhotoven elektronicky, ${stamp}`, MX, PAGE_H - 24);
  ctx.textAlign = 'right';
  ctx.fillText(`Strana ${pageNo} z ${pageCount}`, PAGE_W - MX, PAGE_H - 24);
}

function newPage(env, scale) {
  const canvas = env.createCanvas(Math.round(PAGE_W * scale), Math.round(PAGE_H * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  return { canvas, ctx };
}

function titleBlock(ctx, text) {
  font(ctx, 19, 'bold');
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, MX, 56);
  hline(ctx, MX, PAGE_W - MX, 66, INK, 1.4);
}

/**
 * Vykreslí zápis. Vrací pole pláten (1 nebo 2 strany).
 * env: { createCanvas(w,h), loadImage(src) }
 */
export async function renderPages(state, comp, env, { scale = 2 } = {}) {
  const boards = matchBoards(state, comp);
  const home = sortedLineup(state.home.lineup);
  const away = sortedLineup(state.away.lineup);
  const sum = totals(state, boards);

  const p1 = newPage(env, scale);
  const ctx = p1.ctx;

  titleBlock(ctx, 'ZÁPIS O KONANÉM ŠACHOVÉM UTKÁNÍ');

  // --- Údaje o soutěži ---
  const y1 = 86;
  const wSut = 300;
  const wSk = 120;
  const wSez = 110;
  const gap = 12;
  const wKolo = CW - wSut - wSk - wSez - 3 * gap;
  labeledBox(ctx, 'Soutěž', comp?.name ?? '', MX, y1, wSut);
  labeledBox(ctx, 'Skupina', comp?.group ?? '', MX + wSut + gap, y1, wSk);
  labeledBox(ctx, 'Sezóna', comp?.season ?? '', MX + wSut + wSk + 2 * gap, y1, wSez);
  labeledBox(ctx, 'Kolo', state.round ?? '', MX + wSut + wSk + wSez + 3 * gap, y1, wKolo);
  const y2 = y1 + 40;
  const wDat = 170;
  labeledBox(ctx, 'Hráno dne', fmtDate(state.date), MX, y2, wDat);
  labeledBox(ctx, 'V hrací místnosti', state.venue ?? '', MX + wDat + gap, y2, CW - wDat - gap);

  // --- Sestavy a výsledky ---
  const ty = y2 + 50;
  font(ctx, 11, 'bold');
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SESTAVY DRUŽSTEV A VÝSLEDKY', MX, ty);

  const centerW = 90;
  const sideW = (CW - centerW) / 2;
  const xHome = MX;
  const xCenter = MX + sideW;
  const xAway = xCenter + centerW;
  // sloupce uvnitř strany: poř., jméno, typ a kolonky s ratingem podle toho, co je v datech
  const cNo = 24;
  const cType = 34;
  const cRtg = 40;
  const ratings = ratingColumns([...home, ...away]);
  const cName = sideW - cNo - cType - cRtg * ratings.length;

  // hlavička družstev
  const hy = ty + 8;
  const hh = 42;
  rect(ctx, xHome, hy, sideW, hh, { fill: SHADE });
  rect(ctx, xAway, hy, sideW, hh, { fill: SHADE });
  rect(ctx, xCenter, hy, centerW, hh, { fill: '#ffffff' });
  font(ctx, 7.5, 'normal');
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('DOMÁCÍ', xHome + 8, hy + 12);
  ctx.textAlign = 'right';
  ctx.fillText('HOSTÉ', xAway + sideW - 8, hy + 12);
  fitText(ctx, state.home.team || '—', xHome + 8, hy + 28, sideW - 16, { size: 13, weight: 'bold' });
  fitText(ctx, state.away.team || '—', xAway + 8, hy + 28, sideW - 16, { size: 13, weight: 'bold', align: 'right' });
  font(ctx, 7.5, 'normal');
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  ctx.fillText('VÝSLEDEK', xCenter + centerW / 2, hy + 12);
  const scoreText = sum.missing.length ? '– : –' : `${fmtPoints(sum.home)} : ${fmtPoints(sum.away)}`;
  fitText(ctx, scoreText, xCenter + 2, hy + 29, centerW - 4, { size: 17, weight: 'bold', align: 'center' });

  // záhlaví sloupců
  const ch = ty + 8 + hh;
  const chh = 18;
  font(ctx, 7.5, 'bold');
  ctx.fillStyle = MUTED;
  ctx.textBaseline = 'middle';
  const headY = ch + chh / 2;
  const heads = (x0, mirrored) => {
    const base = [
      ['Poř.', cNo],
      ['Příjmení, jméno', cName],
      ['Typ', cType],
      ...ratings.map((r) => [r.short, cRtg]),
    ];
    const cols = mirrored ? [...base].reverse() : base;
    let x = x0;
    for (const [t, w] of cols) {
      ctx.textAlign = t === 'Příjmení, jméno' ? (mirrored ? 'right' : 'left') : 'center';
      const tx = t === 'Příjmení, jméno' ? (mirrored ? x + w - 4 : x + 4) : x + w / 2;
      ctx.fillText(t, tx, headY);
      x += w;
    }
  };
  heads(xHome, false);
  heads(xAway, true);
  ctx.textAlign = 'center';
  ctx.fillText('Šach. / výsledek', xCenter + centerW / 2, headY);
  hline(ctx, MX, PAGE_W - MX, ch + chh, STRONG, 0.9);

  // řádky šachovnic
  const rowH = 31;
  const ry0 = ch + chh;
  for (let b = 1; b <= boards; b++) {
    const y = ry0 + (b - 1) * rowH;
    if (b % 2 === 0) {
      rect(ctx, xHome, y, sideW, rowH, { fill: '#fafafa', stroke: null });
      rect(ctx, xAway, y, sideW, rowH, { fill: '#fafafa', stroke: null });
    }
    const hp = home[b - 1];
    const ap = away[b - 1];
    const mid = y + rowH / 2 + 0.5;

    const drawSide = (pl, x0, mirrored) => {
      if (!pl) {
        fitText(ctx, 'neobsazeno', mirrored ? x0 + cRtg * ratings.length + cType : x0 + cNo + 4,
          mid, cName - 8, { size: 9, color: '#b0b6c0', align: mirrored ? 'right' : 'left' });
        return;
      }
      const base = [
        ['no', cNo],
        ['name', cName],
        ['type', cType],
        ...ratings.map((r) => [r.key, cRtg]),
      ];
      let x = x0;
      for (const [k, w] of mirrored ? [...base].reverse() : base) {
        if (k === 'no') fitText(ctx, String(pl.no), x, mid, w, { size: 10, color: MUTED, align: 'center' });
        else if (k === 'name') fitText(ctx, pl.name, x + 4, mid, w - 8, { size: 11.5, weight: 'bold', align: mirrored ? 'right' : 'left' });
        else if (k === 'type') fitText(ctx, typeLabel(pl.types), x, mid, w, { size: 9, weight: 'bold', align: 'center', color: '#b45309' });
        else fitText(ctx, fmtRating(pl[k]), x, mid, w, { size: 10, align: 'center' });
        x += w;
      }
    };
    drawSide(hp, xHome, false);
    drawSide(ap, xAway, true);

    // střed: barva, číslo šachovnice, výsledek
    const code = boardResult(state, b);
    const whiteHome = homeIsWhite(b);
    const dot = (cx, white) => {
      ctx.beginPath();
      ctx.arc(cx, mid, 4, 0, Math.PI * 2);
      ctx.fillStyle = white ? '#ffffff' : '#111827';
      ctx.fill();
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    };
    dot(xCenter + 9, whiteHome);
    dot(xCenter + centerW - 9, !whiteHome);
    const label = code ? RESULTS[code].label : '';
    fitText(ctx, String(b), xCenter + 17, mid - 9, centerW - 34, { size: 7.5, color: MUTED, align: 'center' });
    fitText(ctx, label, xCenter + 17, mid + 3, centerW - 34, {
      size: 11.5, weight: 'bold', align: 'center', color: code && RESULTS[code].forfeit ? '#b45309' : INK, min: 8,
    });
    hline(ctx, MX, PAGE_W - MX, y + rowH, '#d1d5db', 0.5);
  }
  const tableBottom = ry0 + boards * rowH;
  vline(ctx, xCenter, hy + hh, tableBottom, LINE, 0.6);
  vline(ctx, xAway, hy + hh, tableBottom, LINE, 0.6);
  rect(ctx, MX, ry0 - chh, CW, chh + boards * rowH, { stroke: STRONG, lw: 0.9 });

  // poznámka k limitům
  font(ctx, 8, 'normal');
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const maxR = maxRestricted(boards);
  const note =
    `Hosté, volní hráči a cizinci v sestavě (nejvýše ${maxR}): domácí ${restrictedCount(home)}, hosté ${restrictedCount(away)}.  ` +
    'Typy: K kapitán, ZK zástupce kapitána, H host, V volný hráč, C cizinec.  K = kontumace.  ● bílé / ○ černé: domácí hrají bílými na lichých šachovnicích.';
  const noteLines = wrapLines(ctx, note, CW);
  noteLines.forEach((l, i) => ctx.fillText(l, MX, tableBottom + 14 + i * 10));

  // rozhodčí
  const ry = tableBottom + 14 + noteLines.length * 10 + 14;
  const roleText = REFEREE_ROLES[state.referee?.role] ?? '';
  labeledBox(ctx, `Jméno a příjmení rozhodčího (${roleText})`, state.referee?.name ?? '', MX, ry, CW);

  // záznam rozhodčího
  const ny = ry + 44;
  font(ctx, 8, 'normal');
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ZÁZNAM ROZHODČÍHO O PRŮBĚHU UTKÁNÍ, PŘÍPADNÉ PŘESTUPKY ČI SPORY, NÁMITKY KAPITÁNŮ', MX + 1, ny);
  const sigTop = PAGE_H - 36 - 100 - 10 - 20; // horní okraj bloku podpisů
  const boxTop = ny + 4;
  const boxBottom = sigTop - 22;
  rect(ctx, MX, boxTop, CW, boxBottom - boxTop, { r: 3 });
  font(ctx, 11, 'normal');
  const lines = wrapLines(ctx, state.notes ?? '', CW - 16);
  const lineH = 15;
  const fits = Math.max(1, Math.floor((boxBottom - boxTop - 14) / lineH));
  const needSecond = lines.length > fits;
  const firstLines = needSecond ? lines.slice(0, fits - 1) : lines;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  firstLines.forEach((l, i) => ctx.fillText(l, MX + 8, boxTop + 18 + i * lineH));
  if (needSecond) {
    font(ctx, 9.5, 'bold');
    ctx.fillStyle = '#b45309';
    ctx.fillText('— pokračování na straně 2 —', MX + 8, boxTop + 18 + firstLines.length * lineH);
  }
  await drawSignatures(ctx, env, state, sigTop);

  const pages = [p1];
  if (needSecond) {
    const p2 = newPage(env, scale);
    const c2 = p2.ctx;
    titleBlock(c2, 'ZÁPIS O UTKÁNÍ – POKRAČOVÁNÍ');
    font(c2, 10.5, 'bold');
    c2.fillStyle = INK;
    c2.textAlign = 'left';
    c2.textBaseline = 'alphabetic';
    const head = `${comp?.name ?? ''}${comp?.group ? ` ${comp.group}` : ''}, kolo ${state.round ?? ''}, ${fmtDate(state.date)}`;
    c2.fillText(head, MX, 88);
    c2.font = `normal 10.5px ${FONT}`;
    c2.fillText(`${state.home.team} – ${state.away.team}   (${scoreText.replace('–', '-')})`, MX, 104);
    font(c2, 8, 'normal');
    c2.fillStyle = MUTED;
    c2.fillText('ZÁZNAM ROZHODČÍHO – POKRAČOVÁNÍ', MX + 1, 130);
    const top2 = 134;
    const bottom2 = sigTop - 22;
    rect(c2, MX, top2, CW, bottom2 - top2, { r: 3 });
    font(c2, 11, 'normal');
    c2.fillStyle = INK;
    const per = Math.floor((bottom2 - top2 - 14) / lineH);
    const rest = lines.slice(fits - 1);
    rest.slice(0, per).forEach((l, i) => c2.fillText(l, MX + 8, top2 + 18 + i * lineH));
    if (rest.length > per) {
      font(c2, 9.5, 'bold');
      c2.fillStyle = '#b91c1c';
      c2.fillText('Text byl zkrácen, zkrať záznam nebo ho vlož jako samostatnou přílohu.', MX + 8, bottom2 - 6);
    }
    await drawSignatures(c2, env, state, sigTop);
    pages.push(p2);
  }
  pages.forEach((p, i) => footer(p.ctx, i + 1, pages.length, state));
  return pages.map((p) => p.canvas);
}
