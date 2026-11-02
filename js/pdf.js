// Minimální zapisovač PDF bez závislostí: každá strana je A4 s jedním obrázkem (JPEG).
// Díky tomu funguje i bez internetu a bez vkládání písem (diakritika je součástí obrázku).

const A4_W = 595.28; // body (1/72 palce)
const A4_H = 841.89;

const enc = new TextEncoder();

function ascii(s) {
  return enc.encode(s);
}

function concat(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * @param {{jpeg: Uint8Array, width: number, height: number}[]} pages  JPEG bajty a rozměry v pixelech
 * @param {{title?: string}} [opts]
 * @returns {Uint8Array}
 */
export function buildPdf(pages, opts = {}) {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (data) => {
    const bytes = typeof data === 'string' ? ascii(data) : data;
    chunks.push(bytes);
    pos += bytes.length;
  };
  const obj = (num, body) => {
    offsets[num] = pos;
    push(`${num} 0 obj\n`);
    push(body);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // číslování: 1 katalog, 2 seznam stran, 3 info, pak pro každou stranu 3 objekty (strana, obsah, obrázek)
  const firstPage = 4;
  const kids = pages.map((_, i) => `${firstPage + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const title = (opts.title ?? 'Zapis o utkani').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, '');
  obj(3, `<< /Title (${title}) /Producer (Zapis o utkani) >>`);

  pages.forEach((p, i) => {
    const pageNum = firstPage + i * 3;
    const contentNum = pageNum + 1;
    const imgNum = pageNum + 2;
    obj(
      pageNum,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] ` +
        `/Resources << /XObject << /Im0 ${imgNum} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentNum} 0 R >>`,
    );
    const content = `q ${A4_W} 0 0 ${A4_H} 0 0 cm /Im0 Do Q`;
    obj(contentNum, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    // obrázek: binární data, proto ručně
    offsets[imgNum] = pos;
    push(`${imgNum} 0 obj\n`);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    );
    push(p.jpeg);
    push('\nendstream\nendobj\n');
  });

  const count = firstPage + pages.length * 3;
  const xrefPos = pos;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  return concat(chunks);
}
