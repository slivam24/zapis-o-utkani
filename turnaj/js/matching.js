// Párování v obecném grafu (Edmondsův algoritmus s květy).
//
// maxCardinalityMatching: největší počet dvojic (bez vah). Používá se pro rychlé testy,
//   jestli jde zbytek hráčů vůbec spárovat (kritérium úplnosti [C4]).
// maxWeightMatching: párování s největší celkovou vahou. Váhy jsou BigInt, takže do jedné
//   váhy jde zakódovat celé lexikografické pořadí kritérií [C5]–[C21] i pořadí kandidátů.
//   Algoritmus je primárně-duální metoda O(n³) podle Galila (1986) v podobě, kterou popsal
//   J. van Rantwijk; zde je napsán znovu pro celočíselné váhy (BigInt).

/**
 * @param {number} n počet vrcholů
 * @param {number[][]} adj seznamy sousedů
 * @param {number[]} [initial] počáteční párování (mate[v] = soused nebo -1)
 * @returns {number[]} mate
 */
export function maxCardinalityMatching(n, adj, initial) {
  const match = initial ? initial.slice() : new Array(n).fill(-1);
  if (!initial) {
    // hladový začátek: výrazně zrychlí hledání
    for (let v = 0; v < n; v++) {
      if (match[v] !== -1) continue;
      for (const w of adj[v]) {
        if (match[w] === -1 && w !== v) {
          match[v] = w;
          match[w] = v;
          break;
        }
      }
    }
  }
  const p = new Array(n);
  const base = new Array(n);
  const used = new Uint8Array(n);
  const blossom = new Uint8Array(n);
  const usedLca = new Uint8Array(n);
  const q = new Int32Array(n);

  function lca(a, b) {
    usedLca.fill(0);
    for (;;) {
      a = base[a];
      usedLca[a] = 1;
      if (match[a] === -1) break;
      a = p[match[a]];
    }
    for (;;) {
      b = base[b];
      if (usedLca[b]) return b;
      b = p[match[b]];
    }
  }

  function markPath(v, b, child) {
    while (base[v] !== b) {
      blossom[base[v]] = 1;
      blossom[base[match[v]]] = 1;
      p[v] = child;
      child = match[v];
      v = p[match[v]];
    }
  }

  function findPath(root) {
    used.fill(0);
    p.fill(-1);
    for (let i = 0; i < n; i++) base[i] = i;
    used[root] = 1;
    let qh = 0;
    let qt = 0;
    q[qt++] = root;
    while (qh < qt) {
      const v = q[qh++];
      for (const to of adj[v]) {
        if (base[v] === base[to] || match[v] === to) continue;
        if (to === root || (match[to] !== -1 && p[match[to]] !== -1)) {
          const cur = lca(v, to);
          blossom.fill(0);
          markPath(v, cur, to);
          markPath(to, cur, v);
          for (let i = 0; i < n; i++) {
            if (blossom[base[i]]) {
              base[i] = cur;
              if (!used[i]) {
                used[i] = 1;
                q[qt++] = i;
              }
            }
          }
        } else if (p[to] === -1) {
          p[to] = v;
          if (match[to] === -1) return to;
          used[match[to]] = 1;
          q[qt++] = match[to];
        }
      }
    }
    return -1;
  }

  for (let v = 0; v < n; v++) {
    if (match[v] !== -1 || adj[v].length === 0) continue;
    let t = findPath(v);
    while (t !== -1) {
      const pv = p[t];
      const ppv = match[pv];
      match[t] = pv;
      match[pv] = t;
      t = ppv;
    }
  }
  return match;
}

/** Počet dvojic v párování. */
export function matchingSize(mate) {
  let c = 0;
  for (let v = 0; v < mate.length; v++) if (mate[v] > v) c++;
  return c;
}

/**
 * Párování s největší vahou.
 * @param {number} nvertex
 * @param {Array<[number, number, bigint]>} edges
 * @param {boolean} maxcardinality nejdřív co nejvíc dvojic, pak největší váha
 * @returns {number[]} mate
 */
export function maxWeightMatching(nvertex, edgesIn, maxcardinality = false) {
  const mateOut = new Array(nvertex).fill(-1);
  if (!edgesIn.length) return mateOut;
  // Váhy zdvojíme, aby všechny duální proměnné zůstaly celá čísla.
  const edges = edgesIn.map(([i, j, w]) => [i, j, BigInt(w) * 2n]);
  const nedge = edges.length;
  let maxweight = 0n;
  for (const e of edges) if (e[2] > maxweight) maxweight = e[2];

  const endpoint = new Array(2 * nedge);
  for (let p = 0; p < 2 * nedge; p++) endpoint[p] = edges[p >> 1][p & 1];
  const neighbend = Array.from({ length: nvertex }, () => []);
  for (let k = 0; k < nedge; k++) {
    const [i, j] = edges[k];
    neighbend[i].push(2 * k + 1);
    neighbend[j].push(2 * k);
  }
  const mate = new Array(nvertex).fill(-1);
  const label = new Array(2 * nvertex).fill(0);
  const labelend = new Array(2 * nvertex).fill(-1);
  const inblossom = Array.from({ length: nvertex }, (_, i) => i);
  const blossomparent = new Array(2 * nvertex).fill(-1);
  const blossomchilds = new Array(2 * nvertex).fill(null);
  const blossombase = [...Array.from({ length: nvertex }, (_, i) => i), ...new Array(nvertex).fill(-1)];
  const blossomendps = new Array(2 * nvertex).fill(null);
  const bestedge = new Array(2 * nvertex).fill(-1);
  const blossombestedges = new Array(2 * nvertex).fill(null);
  const unusedblossoms = [];
  for (let b = nvertex; b < 2 * nvertex; b++) unusedblossoms.push(b);
  const dualvar = [...new Array(nvertex).fill(maxweight), ...new Array(nvertex).fill(0n)];
  const allowedge = new Array(nedge).fill(false);
  let queue = [];

  const slack = (k) => dualvar[edges[k][0]] + dualvar[edges[k][1]] - 2n * edges[k][2];

  function blossomLeaves(b, out = []) {
    if (b < nvertex) out.push(b);
    else for (const t of blossomchilds[b]) blossomLeaves(t, out);
    return out;
  }

  function assignLabel(w, t, p) {
    const b = inblossom[w];
    label[w] = label[b] = t;
    labelend[w] = labelend[b] = p;
    bestedge[w] = bestedge[b] = -1;
    if (t === 1) {
      for (const v of blossomLeaves(b)) queue.push(v);
    } else if (t === 2) {
      const base = blossombase[b];
      assignLabel(endpoint[mate[base]], 1, mate[base] ^ 1);
    }
  }

  function scanBlossom(v, w) {
    const path = [];
    let base = -1;
    while (v !== -1 || w !== -1) {
      let b = inblossom[v];
      if (label[b] & 4) {
        base = blossombase[b];
        break;
      }
      path.push(b);
      label[b] = 5;
      if (labelend[b] === -1) {
        v = -1;
      } else {
        v = endpoint[labelend[b]];
        b = inblossom[v];
        v = endpoint[labelend[b]];
      }
      if (w !== -1) [v, w] = [w, v];
    }
    for (const b of path) label[b] = 1;
    return base;
  }

  function addBlossom(base, k) {
    let [v, w] = edges[k];
    const bb = inblossom[base];
    let bv = inblossom[v];
    let bw = inblossom[w];
    const b = unusedblossoms.pop();
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;
    const path = [];
    const endps = [];
    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(labelend[bv]);
      v = endpoint[labelend[bv]];
      bv = inblossom[v];
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(labelend[bw] ^ 1);
      w = endpoint[labelend[bw]];
      bw = inblossom[w];
    }
    blossomchilds[b] = path;
    blossomendps[b] = endps;
    label[b] = 1;
    labelend[b] = labelend[bb];
    dualvar[b] = 0n;
    for (const lv of blossomLeaves(b)) {
      if (label[inblossom[lv]] === 2) queue.push(lv);
      inblossom[lv] = b;
    }
    const bestedgeto = new Array(2 * nvertex).fill(-1);
    for (const sub of path) {
      let nblists;
      if (blossombestedges[sub] === null) {
        nblists = blossomLeaves(sub).map((lv) => neighbend[lv].map((p) => p >> 1));
      } else {
        nblists = [blossombestedges[sub]];
      }
      for (const nblist of nblists) {
        for (const kk of nblist) {
          let [i, j] = edges[kk];
          if (inblossom[j] === b) [i, j] = [j, i];
          const bj = inblossom[j];
          if (bj !== b && label[bj] === 1 && (bestedgeto[bj] === -1 || slack(kk) < slack(bestedgeto[bj]))) {
            bestedgeto[bj] = kk;
          }
        }
      }
      blossombestedges[sub] = null;
      bestedge[sub] = -1;
    }
    blossombestedges[b] = bestedgeto.filter((kk) => kk !== -1);
    bestedge[b] = -1;
    for (const kk of blossombestedges[b]) {
      if (bestedge[b] === -1 || slack(kk) < slack(bestedge[b])) bestedge[b] = kk;
    }
  }

  function expandBlossom(b, endstage) {
    for (const s of blossomchilds[b]) {
      blossomparent[s] = -1;
      if (s < nvertex) inblossom[s] = s;
      else if (endstage && dualvar[s] === 0n) expandBlossom(s, endstage);
      else for (const lv of blossomLeaves(s)) inblossom[lv] = s;
    }
    if (!endstage && label[b] === 2) {
      const childs = blossomchilds[b];
      const entrychild = inblossom[endpoint[labelend[b] ^ 1]];
      let j = childs.indexOf(entrychild);
      let jstep;
      let endptrick;
      if (j & 1) {
        j -= childs.length;
        jstep = 1;
        endptrick = 0;
      } else {
        jstep = -1;
        endptrick = 1;
      }
      const at = (idx) => childs[(idx + childs.length) % childs.length];
      const ep = (idx) => blossomendps[b][(idx + childs.length) % childs.length];
      let p = labelend[b];
      while (j !== 0) {
        label[endpoint[p ^ 1]] = 0;
        label[endpoint[ep(j - endptrick) ^ endptrick ^ 1]] = 0;
        assignLabel(endpoint[p ^ 1], 2, p);
        allowedge[ep(j - endptrick) >> 1] = true;
        j += jstep;
        p = ep(j - endptrick) ^ endptrick;
        allowedge[p >> 1] = true;
        j += jstep;
      }
      let bv = at(j);
      label[endpoint[p ^ 1]] = label[bv] = 2;
      labelend[endpoint[p ^ 1]] = labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (at(j) !== entrychild) {
        bv = at(j);
        if (label[bv] === 1) {
          j += jstep;
          continue;
        }
        let found = -1;
        for (const lv of blossomLeaves(bv)) {
          if (label[lv] !== 0) {
            found = lv;
            break;
          }
        }
        if (found !== -1) {
          label[found] = 0;
          label[endpoint[mate[blossombase[bv]]]] = 0;
          assignLabel(found, 2, labelend[found]);
        }
        j += jstep;
      }
    }
    label[b] = labelend[b] = -1;
    blossomchilds[b] = blossomendps[b] = null;
    blossombase[b] = -1;
    blossombestedges[b] = null;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  }

  function augmentBlossom(b, v) {
    let t = v;
    while (blossomparent[t] !== b) t = blossomparent[t];
    if (t >= nvertex) augmentBlossom(t, v);
    const childs = blossomchilds[b];
    const len = childs.length;
    const i = childs.indexOf(t);
    let j = i;
    let jstep;
    let endptrick;
    if (i & 1) {
      j -= len;
      jstep = 1;
      endptrick = 0;
    } else {
      jstep = -1;
      endptrick = 1;
    }
    const at = (idx) => childs[(idx + len) % len];
    const ep = (idx) => blossomendps[b][(idx + len) % len];
    while (j !== 0) {
      j += jstep;
      t = at(j);
      const p = ep(j - endptrick) ^ endptrick;
      if (t >= nvertex) augmentBlossom(t, endpoint[p]);
      j += jstep;
      t = at(j);
      if (t >= nvertex) augmentBlossom(t, endpoint[p ^ 1]);
      mate[endpoint[p]] = p ^ 1;
      mate[endpoint[p ^ 1]] = p;
    }
    blossomchilds[b] = [...childs.slice(i), ...childs.slice(0, i)];
    blossomendps[b] = [...blossomendps[b].slice(i), ...blossomendps[b].slice(0, i)];
    blossombase[b] = blossombase[blossomchilds[b][0]];
  }

  function augmentMatching(k) {
    const [v, w] = edges[k];
    for (let [s, p] of [[v, 2 * k + 1], [w, 2 * k]]) {
      for (;;) {
        const bs = inblossom[s];
        if (bs >= nvertex) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelend[bs] === -1) break;
        const t = endpoint[labelend[bs]];
        const bt = inblossom[t];
        s = endpoint[labelend[bt]];
        const j = endpoint[labelend[bt] ^ 1];
        if (bt >= nvertex) augmentBlossom(bt, j);
        mate[j] = labelend[bt];
        p = labelend[bt] ^ 1;
      }
    }
  }

  for (let stage = 0; stage < nvertex; stage++) {
    label.fill(0);
    bestedge.fill(-1);
    for (let b = nvertex; b < 2 * nvertex; b++) blossombestedges[b] = null;
    allowedge.fill(false);
    queue = [];
    for (let v = 0; v < nvertex; v++) {
      if (mate[v] === -1 && label[inblossom[v]] === 0) assignLabel(v, 1, -1);
    }
    let augmented = false;
    for (;;) {
      while (queue.length && !augmented) {
        const v = queue.pop();
        for (const p of neighbend[v]) {
          const k = p >> 1;
          const w = endpoint[p];
          if (inblossom[v] === inblossom[w]) continue;
          let kslack = 0n;
          if (!allowedge[k]) {
            kslack = slack(k);
            if (kslack <= 0n) allowedge[k] = true;
          }
          if (allowedge[k]) {
            if (label[inblossom[w]] === 0) {
              assignLabel(w, 2, p ^ 1);
            } else if (label[inblossom[w]] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) addBlossom(base, k);
              else {
                augmentMatching(k);
                augmented = true;
                break;
              }
            } else if (label[w] === 0) {
              label[w] = 2;
              labelend[w] = p ^ 1;
            }
          } else if (label[inblossom[w]] === 1) {
            const b = inblossom[v];
            if (bestedge[b] === -1 || kslack < slack(bestedge[b])) bestedge[b] = k;
          } else if (label[w] === 0) {
            if (bestedge[w] === -1 || kslack < slack(bestedge[w])) bestedge[w] = k;
          }
        }
      }
      if (augmented) break;

      let deltatype = -1;
      let delta = 0n;
      let deltaedge = -1;
      let deltablossom = -1;
      if (!maxcardinality) {
        deltatype = 1;
        delta = dualvar[0];
        for (let v = 1; v < nvertex; v++) if (dualvar[v] < delta) delta = dualvar[v];
      }
      for (let v = 0; v < nvertex; v++) {
        if (label[inblossom[v]] === 0 && bestedge[v] !== -1) {
          const d = slack(bestedge[v]);
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 2;
            deltaedge = bestedge[v];
          }
        }
      }
      for (let b = 0; b < 2 * nvertex; b++) {
        if (blossomparent[b] === -1 && label[b] === 1 && bestedge[b] !== -1) {
          const ks = slack(bestedge[b]);
          if (ks % 2n !== 0n) throw new Error('maxWeightMatching: lichá rezerva');
          const d = ks / 2n;
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 3;
            deltaedge = bestedge[b];
          }
        }
      }
      for (let b = nvertex; b < 2 * nvertex; b++) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1 && label[b] === 2 && (deltatype === -1 || dualvar[b] < delta)) {
          delta = dualvar[b];
          deltatype = 4;
          deltablossom = b;
        }
      }
      if (deltatype === -1) {
        deltatype = 1;
        let m = dualvar[0];
        for (let v = 1; v < nvertex; v++) if (dualvar[v] < m) m = dualvar[v];
        delta = m > 0n ? m : 0n;
      }
      for (let v = 0; v < nvertex; v++) {
        const l = label[inblossom[v]];
        if (l === 1) dualvar[v] -= delta;
        else if (l === 2) dualvar[v] += delta;
      }
      for (let b = nvertex; b < 2 * nvertex; b++) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1) {
          if (label[b] === 1) dualvar[b] += delta;
          else if (label[b] === 2) dualvar[b] -= delta;
        }
      }
      if (deltatype === 1) break;
      if (deltatype === 2) {
        allowedge[deltaedge] = true;
        let [i, j] = edges[deltaedge];
        if (label[inblossom[i]] === 0) [i, j] = [j, i];
        queue.push(i);
      } else if (deltatype === 3) {
        allowedge[deltaedge] = true;
        queue.push(edges[deltaedge][0]);
      } else if (deltatype === 4) {
        expandBlossom(deltablossom, false);
      }
    }
    if (!augmented) break;
    for (let b = nvertex; b < 2 * nvertex; b++) {
      if (blossomparent[b] === -1 && blossombase[b] >= 0 && label[b] === 1 && dualvar[b] === 0n) {
        expandBlossom(b, true);
      }
    }
  }
  for (let v = 0; v < nvertex; v++) if (mate[v] >= 0) mateOut[v] = endpoint[mate[v]];
  return mateOut;
}
