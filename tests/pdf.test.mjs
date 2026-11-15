import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { buildPdf } from '../js/pdf.js';

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

/** Každá položka tabulky xref musí ukazovat přesně na začátek svého objektu. */
function checkXref(pdf) {
  const text = latin1(pdf);
  const start = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.startsWith('xref', start), 'startxref ukazuje na tabulku xref');
  const rows = text.slice(start).split('\n').slice(2).filter((r) => /^\d{10} \d{5} [nf] $/.test(r));
  rows.slice(1).forEach((r, i) => {
    const off = Number(r.slice(0, 10));
    assert.ok(text.startsWith(`${i + 1} 0 obj`, off), `objekt ${i + 1} na pozici ${off}`);
  });
  return text;
}

test('PDF s bezeztrátovým obrázkem (FlateDecode)', () => {
  const w = 4;
  const h = 2;
  const rgb = new Uint8Array(w * h * 3).fill(255);
  const data = new Uint8Array(zlib.deflateSync(rgb));
  const pdf = buildPdf([{ data, filter: 'FlateDecode', width: w, height: h }]);
  const text = checkXref(pdf);
  assert.match(text, /\/Filter \/FlateDecode \/Length \d+/);
  assert.ok(text.includes(`/Length ${data.length} >>`));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
});

test('PDF s JPEG a se dvěma stranami', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = buildPdf([
    { jpeg, width: 10, height: 10 },
    { jpeg, width: 10, height: 10 },
  ]);
  const text = checkXref(pdf);
  assert.match(text, /\/Count 2/);
  assert.equal((text.match(/\/DCTDecode/g) ?? []).length, 2);
});
