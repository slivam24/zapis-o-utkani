// Čtení souborů .xlsx bez knihoven. Stačí na export z chess-results ("Export do Excelu").
//
// Soubor .xlsx je ZIP s XML uvnitř. Rozbaluje se přes DecompressionStream('deflate-raw'),
// které mají všechny dnešní prohlížeče i Node od verze 18, takže není potřeba žádná závislost.

const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;

const dec = new TextDecoder('utf-8');

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Rozbalí ZIP a vrátí mapu cesta -> text. Načítají se jen vyžádané soubory. */
export async function unzip(buffer, wanted) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // koncový záznam se hledá od konce, protože za ním může být komentář
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= 0 && i > view.byteLength - 22 - 65536; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Soubor není platný .xlsx (chybí konec archivu).');
  let count = view.getUint16(eocd + 10, true);
  let dirOffset = view.getUint32(eocd + 16, true);

  // velké archivy (ZIP64) mají skutečné hodnoty jinde
  if (dirOffset === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (view.getUint32(i, true) === SIG_EOCD64) {
        count = Number(view.getBigUint64(i + 32, true));
        dirOffset = Number(view.getBigUint64(i + 48, true));
        break;
      }
    }
  }

  const out = new Map();
  let p = dirOffset;
  for (let i = 0; i < count && p + 46 <= view.byteLength; i++) {
    if (view.getUint32(p, true) !== SIG_CENTRAL) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (wanted && !wanted.includes(name)) continue;

    // délky hlavičky se čtou z lokálního záznamu, v ústředním adresáři mohou chybět
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const chunk = bytes.subarray(start, start + compSize);
    if (method === 0) out.set(name, dec.decode(chunk));
    else if (method === 8) out.set(name, dec.decode(await inflateRaw(chunk)));
    else throw new Error(`Nepodporovaná komprese v souboru (${method}).`);
  }
  return out;
}

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

const stripTags = (s) => unescapeXml(s.replace(/<[^>]*>/g, ''));

/** Texty ze sdílené tabulky řetězců. */
function sharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map((m) => stripTags(m[1]));
}

const colIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

/** List sešitu jako pole řádků, každý řádek je pole buněk v pořadí sloupců. */
export function sheetToGrid(sheetXml, strings) {
  const grid = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*?r="(\d+)"[^>]*?(?:\/>|>(.*?)<\/row>)/gs)) {
    const inner = rowMatch[2];
    if (!inner) continue;
    const cells = [];
    for (const cell of inner.matchAll(/<c\s+r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const [, letters, attrs, body] = cell;
      const idx = colIndex(letters);
      let value = '';
      if (body) {
        const v = /<v>(.*?)<\/v>/s.exec(body);
        const t = /<t[^>]*>(.*?)<\/t>/s.exec(body);
        if (v) {
          value = attrs.includes('t="s"') ? (strings[Number(v[1])] ?? '') : unescapeXml(v[1]);
        } else if (t) {
          value = stripTags(t[1]);
        }
      }
      cells[idx] = String(value).trim();
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    grid.push(cells);
  }
  return grid;
}

/** Z obsahu souboru .xlsx udělá mřížku buněk prvního listu. */
export async function xlsxToGrid(buffer) {
  const files = await unzip(buffer, ['xl/worksheets/sheet1.xml', 'xl/sharedStrings.xml']);
  const sheet = files.get('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('V souboru chybí list se soupiskami. Je to opravdu export z chess-results?');
  return sheetToGrid(sheet, sharedStrings(files.get('xl/sharedStrings.xml')));
}
