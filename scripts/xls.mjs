// Čtení starého formátu Excelu (.xls, BIFF8) bez knihoven. Stačí na listinu LOK z elo.miramal.com.
//
// Soubor .xls je kontejner OLE (Compound File) s proudem „Workbook“, v něm záznamy BIFF8.
// Čte se jen první list a jen hodnoty buněk (text a čísla), formátování se přeskakuje.

const MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Proud „Workbook“ z kontejneru OLE jako Uint8Array. */
export function workbookStream(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 512 || MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new Error('Soubor není ve formátu .xls (chybí hlavička OLE).');
  }
  // čísla sektorů se čtou se znaménkem: konec řetězu (0xFFFFFFFE) a volný sektor jsou záporné
  const u32 = (o) => view.getUint32(o, true);
  const i32 = (o) => view.getInt32(o, true);
  const secSize = 1 << view.getUint16(0x1e, true);
  const miniSize = 1 << view.getUint16(0x20, true);
  const miniCutoff = u32(0x38);
  const sector = (sid) => 512 + sid * secSize;

  // tabulka FAT: čísla jejích sektorů jsou v hlavičce (109) a dál v řetězu sektorů DIFAT
  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const sid = i32(0x4c + i * 4);
    if (sid >= 0) fatSectors.push(sid);
  }
  let difat = i32(0x44);
  for (let guard = 0; difat >= 0 && guard < 1e5; guard++) {
    const at = sector(difat);
    const per = secSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const sid = i32(at + i * 4);
      if (sid >= 0) fatSectors.push(sid);
    }
    difat = i32(at + per * 4);
  }
  const fat = new Int32Array(fatSectors.length * (secSize / 4));
  fatSectors.forEach((sid, k) => {
    for (let i = 0; i < secSize / 4; i++) fat[k * (secSize / 4) + i] = i32(sector(sid) + i * 4);
  });

  const chain = (start, table) => {
    const out = [];
    for (let sid = start; sid >= 0 && out.length <= table.length; sid = table[sid]) out.push(sid);
    return out;
  };
  const readChain = (start, size) => {
    const out = new Uint8Array(size);
    let pos = 0;
    for (const sid of chain(start, fat)) {
      if (pos >= size) break;
      const n = Math.min(secSize, size - pos);
      out.set(bytes.subarray(sector(sid), sector(sid) + n), pos);
      pos += n;
    }
    if (pos < size) throw new Error('Soubor .xls je poškozený (proud je kratší, než má být).');
    return out;
  };

  // adresář: položky po 128 bajtech, jméno v UTF-16
  const dirSectors = chain(i32(0x30), fat);
  const dir = readChain(i32(0x30), dirSectors.length * secSize);
  const dview = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = dview.getUint16(o + 0x40, true);
    let name = '';
    for (let i = 0; i + 2 < nameLen; i += 2) name += String.fromCharCode(dview.getUint16(o + i, true));
    entries.push({ name, type: dir[o + 0x42], start: dview.getInt32(o + 0x74, true), size: dview.getUint32(o + 0x78, true) });
  }
  const wb = entries.find((e) => e.type === 2 && (e.name === 'Workbook' || e.name === 'Book'));
  if (!wb) throw new Error('V souboru .xls chybí sešit (proud Workbook).');
  if (wb.name === 'Book') throw new Error('Soubor .xls je ve starém formátu Excel 5/95, ten se neumí číst.');
  if (wb.size >= miniCutoff) return readChain(wb.start, wb.size);

  // malé proudy jsou v „mini proudu“ kořenové položky, po sektorech 64 bajtů
  const root = entries[0];
  const mini = readChain(root.start, root.size);
  const mfSectors = chain(i32(0x3c), fat);
  const mfBytes = readChain(i32(0x3c), mfSectors.length * secSize);
  const minifat = new Int32Array(mfBytes.buffer, 0, mfBytes.length / 4);
  const out = new Uint8Array(wb.size);
  let pos = 0;
  for (const sid of chain(wb.start, minifat)) {
    if (pos >= wb.size) break;
    const n = Math.min(miniSize, wb.size - pos);
    out.set(mini.subarray(sid * miniSize, sid * miniSize + n), pos);
    pos += n;
  }
  if (pos < wb.size) throw new Error('Soubor .xls je poškozený (proud je kratší, než má být).');
  return out;
}

/** Záznamy BIFF: [{ type, data }], data jako DataView. */
function records(stream, from = 0) {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const out = [];
  for (let o = from; o + 4 <= stream.length; ) {
    const type = view.getUint16(o, true);
    const len = view.getUint16(o + 2, true);
    out.push({ type, offset: o, data: new DataView(stream.buffer, stream.byteOffset + o + 4, Math.min(len, stream.length - o - 4)) });
    o += 4 + len;
    if (type === 0x000a && from) break; // EOF listu
  }
  return out;
}

/**
 * Čtení řetězců přes hranice záznamů CONTINUE. Na začátku každého pokračování uprostřed znaků
 * je znovu bajt s příznakem, jestli jsou znaky jednobajtové, nebo v UTF-16.
 */
class Chunks {
  constructor(parts) {
    this.parts = parts;
    this.k = 0;
    this.pos = 0;
  }

  get cur() {
    return this.parts[this.k];
  }

  next() {
    this.k++;
    this.pos = 0;
    if (!this.cur) throw new Error('Tabulka textů v souboru .xls je poškozená.');
  }

  u8() {
    if (this.pos >= this.cur.byteLength) this.next();
    return this.cur.getUint8(this.pos++);
  }

  u16() {
    return this.u8() | (this.u8() << 8);
  }

  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }

  skip(n) {
    for (let left = n; left > 0; ) {
      if (this.pos >= this.cur.byteLength) this.next();
      const step = Math.min(left, this.cur.byteLength - this.pos);
      this.pos += step;
      left -= step;
    }
  }

  chars(count, wide) {
    let s = '';
    let w = wide;
    for (let left = count; left > 0; ) {
      if (this.pos >= this.cur.byteLength) {
        this.next();
        w = (this.u8() & 1) === 1;
      }
      const avail = Math.floor((this.cur.byteLength - this.pos) / (w ? 2 : 1));
      const n = Math.min(left, avail);
      if (n === 0) throw new Error('Tabulka textů v souboru .xls je poškozená.');
      for (let i = 0; i < n; i++) {
        s += String.fromCharCode(w ? this.cur.getUint16(this.pos + i * 2, true) : this.cur.getUint8(this.pos + i));
      }
      this.pos += n * (w ? 2 : 1);
      left -= n;
    }
    return s;
  }

  /** Řetězec XLUnicodeRichExtendedString (tabulka SST). */
  string() {
    const count = this.u16();
    const flags = this.u8();
    const runs = flags & 0x08 ? this.u16() : 0;
    const ext = flags & 0x04 ? this.u32() : 0;
    const s = this.chars(count, (flags & 1) === 1);
    this.skip(runs * 4 + ext);
    return s;
  }
}

/** Číslo v zápisu RK (celé číslo nebo zkrácený double, případně děleno 100). */
function rk(v) {
  let n;
  if (v & 2) n = v >> 2;
  else {
    const b = new DataView(new ArrayBuffer(8));
    b.setUint32(4, v & 0xfffffffc, true);
    n = b.getFloat64(0, true);
  }
  return v & 1 ? n / 100 : n;
}

/**
 * Převede první list souboru .xls na pole řádků s hodnotami buněk (text nebo číslo,
 * prázdná buňka je ''). Tvar jako xlsxToGrid v js/xlsx.js.
 */
export function xlsToGrid(buffer) {
  const stream = workbookStream(buffer);
  const globals = records(stream);
  const bof = globals[0];
  if (!bof || bof.type !== 0x0809 || bof.data.getUint16(0, true) !== 0x0600) {
    throw new Error('Soubor .xls není ve formátu Excel 97 a novějším (BIFF8).');
  }

  let sheetAt = -1;
  let sst = [];
  for (let i = 0; i < globals.length; i++) {
    const r = globals[i];
    if (r.type === 0x0085 && sheetAt < 0 && r.data.getUint8(5) === 0) sheetAt = r.data.getUint32(0, true); // BOUNDSHEET, list
    else if (r.type === 0x00fc) {
      const parts = [new DataView(r.data.buffer, r.data.byteOffset + 8, r.data.byteLength - 8)];
      for (let j = i + 1; globals[j]?.type === 0x003c; j++) parts.push(globals[j].data);
      const total = r.data.getUint32(4, true);
      const rd = new Chunks(parts);
      sst = [];
      for (let k = 0; k < total; k++) sst.push(rd.string());
    } else if (r.type === 0x000a) break;
  }
  if (sheetAt < 0) throw new Error('V souboru .xls není žádný list.');

  const grid = [];
  const put = (row, col, value) => {
    while (grid.length <= row) grid.push([]);
    const line = grid[row];
    while (line.length < col) line.push('');
    line[col] = value;
  };
  let pendingString = null; // výsledek vzorce typu text je v následujícím záznamu STRING
  for (const { type, data } of records(stream, sheetAt).slice(1)) {
    const row = data.byteLength >= 4 ? data.getUint16(0, true) : 0;
    const col = data.byteLength >= 4 ? data.getUint16(2, true) : 0;
    if (type === 0x00fd) put(row, col, sst[data.getUint32(6, true)] ?? ''); // LABELSST
    else if (type === 0x0203) put(row, col, data.getFloat64(6, true)); // NUMBER
    else if (type === 0x027e) put(row, col, rk(data.getUint32(6, true))); // RK
    else if (type === 0x00bd) {
      // MULRK: několik čísel vedle sebe v jednom řádku
      const n = (data.byteLength - 6) / 6;
      for (let i = 0; i < n; i++) put(row, col + i, rk(data.getUint32(4 + i * 6 + 2, true)));
    } else if (type === 0x0204) {
      // LABEL: text přímo v buňce (Excel ho v BIFF8 nepíše, jiné programy ano)
      const count = data.getUint16(6, true);
      const wide = (data.getUint8(8) & 1) === 1;
      let s = '';
      for (let i = 0; i < count; i++) s += String.fromCharCode(wide ? data.getUint16(9 + i * 2, true) : data.getUint8(9 + i));
      put(row, col, s);
    } else if (type === 0x0006) {
      // FORMULA: uložený výsledek
      if (data.getUint16(12, true) !== 0xffff) put(row, col, data.getFloat64(6, true));
      else if (data.getUint8(6) === 0) pendingString = { row, col };
      else if (data.getUint8(6) === 1) put(row, col, data.getUint8(8));
    } else if (type === 0x0207 && pendingString) {
      const rd = new Chunks([data]);
      const count = rd.u16();
      put(pendingString.row, pendingString.col, rd.chars(count, (rd.u8() & 1) === 1));
      pendingString = null;
    } else if (type === 0x000a) break;
  }
  return grid;
}
