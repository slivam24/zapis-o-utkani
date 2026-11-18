// Turnaj 15 hráčů na 9 kol z příručky FIDE „Mastering the Dutch“ (M. Held, verze 2026,
// tec.fide.com), závěrečná tabulka v kapitole 12. Tady jsou jen fakta potřebná k testu:
// startovní čísla, ratingy a výsledky. Kódy: +W8 = výhra bílými proti č. 8, =B9 remíza černými,
// -F3 kontumační prohra s č. 3, +F4 kontumační výhra, HPB půlbodové volno na žádost,
// PAB volno přidělené losováním. Vylosovaná barva pro 1. kolo: bílá.
export const ratings = [2509, 2445, 2421, 2402, 2309, 2307, 2286, 2158, 2132, 2123, 2116, 2113, 2105, 1936, 1900];

export const table = {
  1: '+W8 +B14 =W4 +B2 =W3 +B7 =W9 +W13 +B10',
  2: '=B9 +W5 =B3 -W1 =B12 +W10 -B4 +W8 +F13',
  3: '+W10 +B15 =W2 +F4 =B1 +W4 +W8 =B7 =B9',
  4: '+B11 +W13 =B1 -F3 +W5 -B3 +W2 +B9 +W7',
  5: '=W12 -B2 =B6 +W13 -B4 -F14 -W10 PAB +W11',
  6: '-B13 HPB =W5 +B14 -W8 +B15 -W7 -B11 PAB',
  7: '-W14 +B10 HPB +W12 +B9 -W1 +B6 =W3 -B4',
  8: '-B1 +W11 +F13 -W9 +B6 +W12 -B3 -B2 +W15',
  9: '=W2 =B12 +W14 +B8 -W7 =B11 =B1 -W4 =W3',
  10: '-B3 -W7 -B11 PAB +W15 -B2 +B5 +W12 -W1',
  11: '-W4 -B8 +W10 +B15 -B13 =W9 -B12 +W6 -B5',
  12: '=B5 =W9 +W15 -B7 =W2 -B8 +W11 -B10 -W14',
  13: '+W6 -B4 -F8 -B5 +W11 PAB +W14 -B1 -F2',
  14: '+B7 -W1 -B9 -W6 PAB +F5 -B13 -W15 +B12',
  15: 'PAB -W3 -B12 -W11 -B10 -W6 HPB +B14 -B8',
};
