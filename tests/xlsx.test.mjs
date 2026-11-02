import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { xlsxToGrid, sheetToGrid, unzip } from '../js/xlsx.js';
import { parseRostersFromGrid, parseRoundsFromGrid, titleFromGrid, gridKind, splitSeason } from '../js/parse.js';

// ---- sestavení zkušebního .xlsx (stejná stavba, jakou posílá chess-results) ----

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Zabalí soubory do ZIP. deflate=false uloží bez komprese (obojí musí čtečka zvládnout). */
function makeZip(files, deflate = true) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8');
    const data = deflate ? zlib.deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(deflate ? 8 : 0, 10);
    dir.writeUInt32LE(crc32(raw), 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const dirBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(dirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...chunks, dirBuf, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Z pole řádků udělá list; řetězce jdou do sdílené tabulky, čísla přímo. */
function makeSheet(rows) {
  const strings = [];
  const idx = (s) => {
    const i = strings.indexOf(s);
    return i >= 0 ? i : strings.push(s) - 1;
  };
  const xmlRows = rows
    .map((cells, r) => {
      const cs = cells
        .map((val, c) => {
          const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
          if (val === '' || val === null || val === undefined) return `<c r="${ref}" />`;
          if (typeof val === 'number') return `<c r="${ref}"><v>${val}</v></c>`;
          return `<c r="${ref}" t="s"><v>${idx(String(val))}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join('');
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${xmlRows}</sheetData></worksheet>`;
  const shared = `<?xml version="1.0"?><sst count="${strings.length}">${strings
    .map((s) => `<si><t>${esc(s)}</t></si>`)
    .join('')}</sst>`;
  return { 'xl/worksheets/sheet1.xml': sheet, 'xl/sharedStrings.xml': shared };
}

// ---- data podle skutečného exportu ----

const ROSTER_ROWS = [
  ['Z turnajové databáze Chess-results https://chess-results.com'],
  ['Krajský přebor ÚKŠS 2026/2027 '],
  ['Poslední aktualizace18.10.2026 16:01:22'],
  ['Sestava družstva bez výsledků'],
  ['1. Duras Ústí nad Labem "B" (Rtg prům.:1917 / PH 1: 1 / PH 2: 4) Kapitán: Pavel Chrz, pavel.chrz@sachyusti.cz, 606144420', '', '', '', '', '', '', '', ''],
  ['Šach.', '', 'Jméno', 'Rtg', 'FED', 'FideID', 'Typ', 'Body ', 'Partie'],
  [1, '', 'Kriz, Denis', 2003, 'CZE', '23767537', 'Z', 0, 0],
  [2, 'CM', 'Chrz, Pavel', 2000, 'CZE', '307980', 'Z,K', 0, 0],
  [3, '', 'Poliakov, Ivan', 1858, 'CZE', '34170260', 'H', 1, 1],
  ['2. SK Děčín "B" (Rtg prům.:2021 / PH 1: 3 / PH 2: 5,5) Kapitán: Mašek Daniel, danmasek.2002@seznam.cz, 777803061', '', '', '', '', '', '', '', ''],
  ['Šach.', '', 'Jméno', 'Rtg', 'FED', 'FideID', 'Typ', 'Body ', 'Partie'],
  [1, '', 'Buchcar, Tomas', 2134, 'CZE', '328421', 'Z,V', 1, 1],
  [2, '', 'Bach, Ulf-Gunter', 1960, 'GER', '24603384', 'C', 1, 1],
];

// Extraliga: oddělený sloupec RtgFIDE a žádné typy
const FIDE_ROWS = [
  ['Z turnajové databáze Chess-results https://chess-results.com'],
  ['šachy.cz Extraliga 2026/2027 '],
  ['Poslední aktualizace01.11.2026 18:25:11'],
  ['Sestava družstva bez výsledků'],
  ['1. Stelar OAZA Praha (Rtg prům.:2405 / PH 1: 3 / PH 2: 10) Kapitán: Baštář Výprachtický David, 737720835, a@b.cz', '', '', '', '', '', '', ''],
  ['Šach.', '', 'Jméno', 'RtgFIDE', 'FED', 'FideID', 'Body', 'Partie'],
  [1, 'GM', 'Seemann, Jakub', 2503, 'POL', '21874697', 1, 2],
  [5, '', 'Cheraghi, Amin', 2404, 'IRI', '12524840', 1.5, 2],
  ['2. 1. Novoborský ŠK (Rtg prům.:2652 / PH 1: 6 / PH 2: 12,5) Kapitán: Boleslav Petr, 739206860, c@d.cz', '', '', '', '', '', '', ''],
  ['Šach.', '', 'Jméno', 'RtgFIDE', 'FED', 'FideID', 'Body', 'Partie'],
  [1, 'GM', 'Nihal, Sarin', 2720, 'IND', '25092340', 0, 0],
  [2, 'GM', 'Wojtaszek, Radoslaw', 2654, 'POL', '1118358', 0, 0],
];

const ROUND_ROWS = [
  ['Z turnajové databáze Chess-results https://chess-results.com'],
  ["Krajský přebor III. třídy 'B' ÚKŠS 2026/27 "],
  ['Poslední aktualizace18.10.2026 16:02:35'],
  ['Los družstev pro všechna kola'],
  ['1. Kolo Datum kola 2026/10/18 Hodina 10:00', '', '', '', '', ''],
  ['Čís.', 'Družstvo', 'Družstvo', 'Výsl.', ':', 'Výsl.'],
  [1, 'SPORTIS Svádov-Olšinky "B"', 'TJ Libouchec "B"', 2, ':', 3],
  [2, 'ŠK Teplice "C"', 'Teplice Chess Club "C"', 2, ':', 3],
  ['2. Kolo Datum kola 2026/11/08 Hodina 10:00', '', '', '', '', ''],
  ['Čís.', 'Družstvo', 'Družstvo', 'Výsl.', ':', 'Výsl.'],
  [1, 'TJ Libouchec "B"', 'SK Děčín "D"', '', ':', ''],
];

const xlsxOf = (rows, deflate = true) => makeZip(makeSheet(rows), deflate);

// ---- testy ----

test('rozbalení .xlsx: komprimovaný i nekomprimovaný', async () => {
  for (const deflate of [true, false]) {
    const grid = await xlsxToGrid(xlsxOf(ROSTER_ROWS, deflate));
    assert.equal(grid.length, ROSTER_ROWS.length, `deflate=${deflate}`);
    assert.equal(grid[6][2], 'Kriz, Denis');
  }
});

test('chybějící list dá srozumitelnou chybu', async () => {
  await assert.rejects(() => xlsxToGrid(makeZip({ 'docProps/core.xml': '<x/>' })), /export z chess-results/);
});

test('poškozený soubor dá srozumitelnou chybu', async () => {
  await assert.rejects(() => xlsxToGrid(new Uint8Array([1, 2, 3, 4]).buffer), /platný \.xlsx/);
});

test('prázdné buňky drží pořadí sloupců', () => {
  const grid = sheetToGrid(
    '<worksheet><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row></worksheet>',
    ['prvni', 'treti'],
  );
  assert.deepEqual(grid[0], ['prvni', '', 'treti']);
});

test('export soupisek: družstva, kapitáni, typy a ratingy', async () => {
  const grid = await xlsxToGrid(xlsxOf(ROSTER_ROWS));
  const teams = parseRostersFromGrid(grid);
  assert.deepEqual(teams.map((t) => t.name), ['Duras Ústí nad Labem "B"', 'SK Děčín "B"']);
  assert.equal(teams[0].captain, 'Pavel Chrz');
  assert.deepEqual(teams[0].players[0], { no: 1, name: 'Kriz, Denis', types: [], rtg: 2003, nat: null, fide: null });
  assert.deepEqual(teams[0].players[1].types, ['K']);
  assert.deepEqual(teams[0].players[2].types, ['H']);
  assert.deepEqual(teams[1].players[0].types, ['V']);
  assert.deepEqual(teams[1].players[1].types, ['C'], 'cizinec se počítá do limitu podle čl. 3.6.3');
});

test('export s odděleným sloupcem RtgFIDE', async () => {
  const teams = parseRostersFromGrid(await xlsxToGrid(xlsxOf(FIDE_ROWS)));
  assert.equal(teams.length, 2);
  const p = teams[0].players[0];
  assert.equal(p.fide, 2503, 'RtgFIDE patří do kolonky FIDE');
  assert.equal(p.rtg, null);
  assert.equal(teams[0].players[1].name, 'Cheraghi, Amin', 'hráč bez titulu má jméno ve stejném sloupci');
});

test('název soutěže a sezóna z hlavičky exportu', async () => {
  assert.deepEqual(splitSeason(titleFromGrid(await xlsxToGrid(xlsxOf(ROSTER_ROWS)))), ['Krajský přebor ÚKŠS', '2026/2027']);
  assert.deepEqual(splitSeason(titleFromGrid(await xlsxToGrid(xlsxOf(FIDE_ROWS)))), ['šachy.cz Extraliga', '2026/2027']);
  assert.deepEqual(splitSeason(titleFromGrid(await xlsxToGrid(xlsxOf(ROUND_ROWS)))), ["Krajský přebor III. třídy 'B' ÚKŠS", '2026/2027']);
});

test('export rozlosování: kola, termíny a dvojice', async () => {
  const grid = await xlsxToGrid(xlsxOf(ROUND_ROWS));
  const names = ['SPORTIS Svádov-Olšinky "B"', 'TJ Libouchec "B"', 'ŠK Teplice "C"', 'Teplice Chess Club "C"', 'SK Děčín "D"'];
  const rounds = parseRoundsFromGrid(grid, names);
  assert.deepEqual(rounds.map((r) => r.no), [1, 2]);
  assert.deepEqual(rounds.map((r) => r.date), ['2026-10-18', '2026-11-08']);
  assert.equal(rounds[0].time, '10:00');
  assert.deepEqual(rounds[0].matches[0], { home: 'SPORTIS Svádov-Olšinky "B"', away: 'TJ Libouchec "B"' });
  assert.equal(rounds[1].matches[0].away, 'SK Děčín "D"');
});

test('pozná, jestli je v exportu soupiska nebo rozlosování', async () => {
  assert.equal(gridKind(await xlsxToGrid(xlsxOf(ROSTER_ROWS))), 'rosters');
  assert.equal(gridKind(await xlsxToGrid(xlsxOf(ROUND_ROWS))), 'rounds');
  assert.equal(gridKind([['Něco úplně jiného']]), 'unknown');
});

test('pozná druh i bez českého názvu seznamu', () => {
  assert.equal(gridKind(ROSTER_ROWS.slice(4).map((r) => r.map(String))), 'rosters');
  assert.equal(gridKind(ROUND_ROWS.slice(4).map((r) => r.map(String))), 'rounds');
});

test('unzip čte jen vyžádané soubory', async () => {
  const files = await unzip(xlsxOf(ROSTER_ROWS), ['xl/sharedStrings.xml']);
  assert.deepEqual([...files.keys()], ['xl/sharedStrings.xml']);
});
