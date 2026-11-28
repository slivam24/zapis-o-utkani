// Seznam změn v aplikaci, jak ho vidí uživatel (O aplikaci → Co je nového). Nejnovější nahoře.
// Při každé změně, kterou uživatel pozná, přidej položku k dnešnímu datu (nebo nový den navrch).
// Verze aplikace je datum nejnovějšího dne a počet jeho položek (2026-11-28#3): když se změní,
// aplikace upozorní na novinky, i když přibude jen položka ke dni, který už v seznamu je.

export const CHANGES = [
  {
    date: '2026-11-28',
    items: [
      '<b>Hrací místnost se doplní sama</b> podle stránky domácího družstva na chess.cz. Když vybereš jiný zápas, vymění se za místnost nového domácího družstva.',
      'Hrací místnost, kterou přepíšeš, si zařízení u družstva zapamatuje a příště ji nabídne místo té z chess.cz.',
      '<b>Partie v PGN:</b> v kroku Výstup tlačítko <b>Stáhnout partie (PGN)</b>. Barvy se střídají podle soutěžního řádu (domácí na 1. šachovnici bílými, na 2. černými…), texty jsou bez diakritiky a uvozovek. Kontumace se nehrály, v PGN nejsou.',
    ],
  },
  {
    date: '2026-11-27',
    items: [
      'Nová sekce <b>O aplikaci</b> v menu: návod krok za krokem, seznam změn a informace o aplikaci. Po aktualizaci aplikace upozorní, že má novinky.',
      'Hráči na soupiskách mají <b>aktuální Elo</b> (národní i FIDE) z listiny LOK, ne Elo z přihlášek na začátku soutěže.',
      'Soutěže, ke kterým svaz ještě nezveřejnil soupisky (třeba finále MČR mládeže), jsou v nabídce dole ve skupině <b>Zatím bez soupisek</b>. Soupisky se doplní samy.',
      'Kraj, který pro sezónu zatím nemá na chess.cz žádné soutěže (Praha hraje v kalendářním roce), to v zápisu i v Nastavení vysvětlí. Soutěže zveřejněné během sezóny přibudou samy.',
      'Když se rozpracovaný zápis nevejde do úložiště zařízení, objeví se výrazné upozornění s odkazem do archivu.',
      'Podpisy fungují správně i po otočení tabletu nebo změně velikosti okna.',
      'Při prvním uložení do archivu aplikace požádá prohlížeč, aby její data nemazal. Nápověda upozorňuje, jak je to na iPhonu a iPadu.',
      'Ikony pro plochu iPhonu a pro instalaci na Androidu.',
    ],
  },
  {
    date: '2026-11-16',
    items: [
      '<b>Podpis na telefonu přes QR kód:</b> na počítači se v kroku Závěr a podpisy ukáže QR kód, telefon otevře stejný zápis rovnou u podpisů.',
      'Aplikace se po stažení nové verze sama obnoví, nebo nabídne tlačítko <b>Načíst</b>, aby se nepřerušila rozdělaná práce.',
      '<b>Soutěže z celé republiky</b> (přes 100) přímo ze stránek svazu chess.cz: jména s diakritikou, národní Elo i Elo FIDE, typy hráčů.',
      'Nabídka soutěží po skupinách (celostátní, mládež, kraje) od nejvyšší soutěže, s jednotnými zkratkami. V Nastavení jde vybrat <b>Můj kraj</b>.',
      'Ukončené soutěže jsou v nabídce dole, zápis z nich jde pořád dodělat.',
      'Soupisky se stahují jen pro vybranou soutěž. S nastaveným krajem si je aplikace stáhne předem, takže v hrací místnosti funguje i bez internetu.',
    ],
  },
  {
    date: '2026-11-15',
    items: [
      'Oprava: v PDF byla někdy místo zápisu jen zelená plocha. Stránky se teď ukládají bez ztráty kvality.',
      'Prohlížeč, který kvůli ochraně proti sledování blokuje čtení obrázku (třeba LibreWolf), aplikace pozná a poradí, co povolit.',
    ],
  },
  {
    date: '2026-11-12',
    items: [
      '<b>Loga v zápisu:</b> Šachový svaz ČR, krajský svaz a loga obou družstev. Každé jde vypnout.',
      '<b>Odeslání zápisu e-mailem:</b> na tabletu a telefonu s PDF v příloze, na počítači přes poštovní program. Adresa se pamatuje pro každou soutěž.',
      'Dvě zobrazení: <b>Počítač</b> a <b>Tablet a mobil</b>. Aplikace vybere samo podle zařízení, přepnout jde v Nastavení.',
      'Menu v hlavičce: nový zápis, archiv, nastavení, nápověda a ochrana osobních údajů.',
      '<b>Nastavení:</b> funkce, které nepotřebuješ pokaždé, jde vypnout a zápis je pak jednodušší.',
      '<b>Archiv</b> se zálohou do souboru a nahráním zpátky (i na jiném zařízení), upozornění na staré zápisy.',
    ],
  },
  {
    date: '2026-11-03',
    items: [
      'Průběh utkání na celou obrazovku se přizpůsobí i velkému monitoru: písmo roste s obrazovkou, osm šachovnic se vejde bez posouvání.',
      'Rozhodčím může být kterýkoli hráč ze soupisky, jméno jde dál i napsat.',
      'Tlačítko <b>Celá obrazovka</b> přímo u skóre.',
      'Oprava: po aktualizaci se někdy ještě načetla stará verze aplikace.',
    ],
  },
  {
    date: '2026-11-02',
    items: [
      'Zápis v pěti krocích: zápas, sestavy, výsledky, závěr a podpisy, výstup do PDF a obrázku.',
      'Soupisky a rozlosování se obnovují samy každý pátek.',
      'Výsledky jako přehled utkání: klepnutím na šachovnici se zadá výsledek, na telefon se vejde celé utkání.',
      'Průběh utkání na celou obrazovku podle papírového zápisu a přepínání na celý zápis.',
      'Kontrola zápisu rozdělená na nutné opravy a doporučení, s odkazem na krok, kde se chyba opraví.',
      'Počet šachovnic jde v zápisu změnit. Limit hostů, volných hráčů a cizinců je jen upozornění.',
      'Přidání vlastní soutěže z chess-results ve třech krocích.',
    ],
  },
];

/** Verze aplikace: datum posledních změn a počet jejich položek (RRRR-MM-DD#N). */
export const VERSION = `${CHANGES[0].date}#${CHANGES[0].items.length}`;

/** Den seznamu změn, který uživatel s naposledy viděnou verzí ještě neviděl (celý nebo jeho nové položky). */
export function isNew(day, seen) {
  if (!seen) return false;
  const [date, count] = String(seen).split('#');
  if (day.date !== date) return day.date > date;
  // starší verze bez počtu položek: přibývat mohlo jen u nejnovějšího dne
  return count === undefined ? day === CHANGES[0] : day.items.length > Number(count);
}

/** Datum ve tvaru 27. 11. 2026. */
export function fmtChangeDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}

/** Dny se změnami novějšími než naposledy viděná verze (prázdné, když uživatel vše viděl). */
export const newerThan = (seen) => CHANGES.filter((c) => !seen || isNew(c, seen));
