# Zápis o utkání

Webová aplikace, která nahrazuje papírový „Zápis o konaném šachovém utkání“. Soupisky družstev se načítají
ze stránek svazu [chess.cz](https://www.chess.cz/souteze/vyber-kraje/) (u soutěží, které tam nejsou,
z [chess-results.com](https://chess-results.com)), zápis se vyplňuje na telefonu nebo tabletu, podepisuje se
prstem a na konci vznikne **PDF** a **obrázek (PNG)** zápisu.

## Postup při utkání

1. **Zápas:** vyber soutěž, kolo a zápas (nebo rovnou domácí a hostující družstvo), datum a hrací místnost.
   Hrací místnost se doplní ze stránky domácího družstva na chess.cz; ručně přepsanou si zařízení u družstva pamatuje.
2. **Sestavy:** zaškrtni hráče ze soupisky (až 8, v KP III až 5). Šachovnice se přidělují podle pořadí na soupisce.
   Aplikace hlídá limit hostů, volných hráčů a cizinců (čl. 3.6.3) a nejmenší počet hráčů (čl. 3.6.2).
3. **Výsledky:** `1 : 0`, `½ : ½`, `0 : 1` a kontumace `1K : 0K`, `0K : 0K`, `0K : 1K`.
   Neobsazené šachovnice se doplní jako kontumace samy. Součet se počítá automaticky.
   Tlačítko **Celá obrazovka** přepne tablet na velký přehled průběhu utkání, čitelný i z dálky,
   a odtud jde přepnout i na celý zápis.
4. **Závěr a podpisy:** rozhodčí, kapitáni, záznam rozhodčího a tři podpisy.
5. **Výstup:** kontrola zápisu (co je nutné opravit a co jen doporučujeme, s odkazem na příslušný krok),
   loga v zápisu, náhled na celou obrazovku, PDF, PNG, partie v PGN, sdílení a odeslání e-mailem.

### Partie v PGN

Tlačítko **Stáhnout partie (PGN)** v kroku Výstup (`js/pgn.js`) uloží jednu partii na šachovnici: hlavičky
Event, Site, Date, Round (`kolo.šachovnice`), White, Black, Result, WhiteTeam, BlackTeam, WhiteElo a BlackElo
(Elo FIDE, jinak neoznačené Elo; národní se nepoužije) a Board, za nimi jen výsledek, protože tahy zápis nemá.
Barvy podle čl. 3.4.1: domácí bílými na lichých šachovnicích, výsledek je z pohledu bílého (výhra domácích
na 2. šachovnici je `0-1`). Všechny texty jsou bez diakritiky, uvozovek a apostrofů (jen ASCII). Kontumované
šachovnice se nehrály, v PGN nejsou; partie bez zadaného výsledku má `*`.

### Podpis na telefonu (QR kód)

Myší se podepisuje špatně. Na počítači je v kroku **Závěr a podpisy** tlačítko **Podepsat na telefonu**: ukáže QR kód,
telefon ho načte fotoaparátem a otevře aplikaci se stejným zápisem rovnou u podpisů. Podepíše se prstem a zápis
se odešle z telefonu. Bez serveru: zápis (bez podpisů) je zkomprimovaný přímo v odkazu v části za `#`, kterou
prohlížeč na server neposílá (`js/link.js`). U soutěží ze sdílených dat jdou hráči jen jako pořadí na soupisce,
kterou má telefon stejnou; kontrolní součet pozná, když se soupisky na zařízeních liší (telefon pak zkusí stáhnout
aktuální). QR kód je tak malý (verze kolem 11, 61×61 modulů). Vlastní soutěže jdou celé. Loga družstev se nepřenášejí.
Telefon se starší verzí aplikace se po načtení odkazu sám obnoví na novou verzi. QR kód kreslí knihovna
[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT, `js/vendor/qrcode.js`).

### Menu, nastavení a archiv

Zápis zůstává co nejjednodušší, všechno ostatní je v **☰ Menu** v hlavičce:

- **Nový zápis** a **Archiv**: archiv je jen v zařízení, proto jde stáhnout do souboru (celý i jednotlivé zápisy)
  a nahrát zpátky na stejném nebo jiném zařízení. Zápisy se sloučí bez duplicit (stejný zápis nahradí jen novější verze).
  Archiv upozorní na zápisy starší než zvolená lhůta (výchozí 12 měsíců) a nabídne jejich smazání.
- **Můj profil**: moje kraje (víc najednou; nabídka soutěží pak ukáže celostátní soutěže a tyto kraje), oblíbené
  soutěže (hvězdička ☆ u soutěže, v nabídce jsou úplně nahoře), moje družstva (po výběru kola se sám vybere
  zápas mého družstva), loga (logo kraje, loga družstev a která jsou v novém zápisu zapnutá: loga družstev vždy,
  jen u mého družstva, nebo nikdy) a můj podpis se jménem (v kroku Závěr a podpisy tlačítko **Vložit můj podpis**,
  nikdy se nevloží sám). Oblíbené soutěže a soutěže mých krajů si aplikace stáhne předem pro hraní bez internetu.
  Profil jde stáhnout do souboru (`profil-zapis-RRRR-MM-DD.json`) i s logy, nastavením, e-mailovými adresami,
  rozhodčími, hracími místnostmi a vlastními soutěžemi, a nahrát na jiném zařízení (`js/profile.js`).
  Podpis jde do souboru jen po zaškrtnutí. Při nahrání se oblíbené a nastavení vezmou ze souboru, loga a zapamatované
  údaje se sloučí s tím, co v zařízení je, nic se nesmaže.
- **Nastavení**: zobrazení, funkce, které jde vypnout (celá obrazovka, úprava hráčů, hráč mimo soupisku, rychlé texty
  záznamu, loga, e-mail, PNG, sdílení, přidání vlastní soutěže), lhůta archivu a smazání všech dat ze zařízení.
- **O aplikaci a návod**: tři záložky. **Návod** krok za krokem i s častými potížemi, **Co je nového** (seznam změn
  po dnech) a **O aplikaci** (verze, odkud jsou data, kde nahlásit chybu). Po aktualizaci aplikace lišta upozorní na novinky.
- **Ochrana osobních údajů**: co se kde ukládá.

Seznam změn je v `js/changelog.js`. Při změně, kterou uživatel pozná, se do něj přidá položka k dnešnímu datu
(nový den navrch). Datum nejnovějšího dne je verze aplikace: když se změní, zařízení, které ho ještě nevidělo, ukáže
lištu **Aplikace má novinky**. Nové dny jsou v seznamu označené.

### Zobrazení pro počítač a pro tablet a mobil

Aplikace má dvě zobrazení a vybere je sama podle zařízení: s myší je to **Počítač** (hustší ovládání,
karty vedle sebe, e-mail přes poštovní program), s dotykovou obrazovkou **Tablet a mobil** (velké dotykové
prvky, odesílání přes nabídku sdílení). V Nastavení jde zobrazení přepnout ručně, zařízení si volbu pamatuje;
volba **Automaticky** vrátí výběr podle zařízení.

### Loga v zápisu

Zápis může mít 0 až 4 loga: Šachový svaz ČR (je součástí aplikace a ve výchozím stavu zapnuté), krajský svaz,
domácí a hosté. Loga svazů jsou vlevo nahoře vedle nadpisu jako na papírovém zápisu, loga družstev u jejich názvů.
Každé jde v kroku Výstup vypnout. Logo krajského svazu a loga družstev se nahrají z obrázku v zařízení,
zmenší se a zařízení si je pamatuje (loga družstev podle názvu družstva), takže příště se doplní sama.

### Odeslání e-mailem

Na tabletu a telefonu se otevře nabídka sdílení se zápisem v PDF jako přílohou; adresa příjemce se zkopíruje
do schránky. Na počítači se PDF stáhne a otevře se poštovní program s vyplněným předmětem a textem
(odkaz `mailto:` přílohu přidat neumí, soubor se přiloží ručně). Adresa se pamatuje pro každou soutěž zvlášť.
Aplikace nic neodesílá přes vlastní server, e-mail jde vždy z pošty uživatele. Hotový zápis jde uložit do archivu v zařízení.

Aplikace funguje i **bez internetu** (po prvním otevření). Internet je potřeba jen pro stažení čerstvých soupisek.
Dá se „nainstalovat“ na plochu telefonu (v prohlížeči: Přidat na plochu).

## Pravidla ze soutěžního řádu ŠSČR, která aplikace hlídá

| Článek | Co |
|---|---|
| 3.6.2 | Hráči v sestavě v pořadí podle soupisky, šachovnice od první bez mezer, nejméně polovina hráčů (8 → 4, 5 → 3) |
| 3.6.3 | Hosté + volní hráči + cizinci je méně než polovina předepsaného počtu (8 → nejvýše 3, 5 → nejvýše 2) |
| 3.4.1 | Domácí hrají bílými na lichých šachovnicích (v zápisu je to vyznačeno) |
| 5.1, 5.3.1 | 1 / ½ / 0 bodů za partii, skóre utkání je součet bodů |
| 2.5.6, 2.7.3 | Zápis podepisuje rozhodčí a oba kapitáni, obsahuje připomínky kapitánů |
| 2.4.6 | Zápis se archivuje nejméně 6 měsíců (aplikace ho drží v archivu zařízení) |

Typy hráčů: **K** kapitán, **ZK** zástupce kapitána, **H** host, **V** volný hráč, **C** cizinec.

## Data (soupisky a rozlosování)

Soupisky a rozlosování soutěží ze `scripts/competitions.json` jsou v adresáři `data/`, rozdělené,
aby aplikace nestahovala soupisky celé republiky (`scripts/data_store.mjs`):

- `data/index.json`: seznam soutěží bez soupisek (název, kraj, šachovnice, první a poslední kolo), desítky kB;
- `data/comp/<id>.json`: jedna soutěž celá. Aplikace ji stáhne, až když se soutěž vybere. S nastaveným krajem
  si předem stáhne celostátní soutěže a soutěže kraje, takže v hrací místnosti funguje i bez internetu.

Data se obnoví sama **každý pátek odpoledne** (úloha **Aktualizace soupisek**). Úloha přitom přidá i soutěže, které
svaz na chess.cz zveřejnil až během sezóny (Praha hraje v kalendářním roce, její soutěže se objevují později).
Obnova se spouští také po přidání soutěže z hlášení
a kdykoli ručně přes **Actions → Aktualizace soupisek → Run workflow**. Nový soubor se uloží jen tehdy,
když se soupisky nebo rozlosování opravdu změnily. V aplikaci se pak projeví po otevření s internetem
nebo tlačítkem pro obnovení dat.

GitHub vypíná plánované úlohy v repozitáři, kde se 60 dní nic nezměnilo. Pak stačí úlohu v záložce
Actions znovu povolit (**Enable workflow**).

Soutěže se nastavují v `scripts/competitions.json`: číslo soutěže na chess.cz (`chesscz`), případně číslo turnaje
na chess-results (`tnr`), počet šachovnic a kraj.

**Odkud se soupisky berou.** Přednost má chess.cz: stránka „Všechny soupisky“ a kompletní „Rozpis“ soutěže,
tedy dva dotazy na soutěž (`scripts/chesscz.mjs`). Má všechny soutěže svazu, jména s diakritikou a zvlášť národní
Elo i Elo FIDE. Chess-results je záloha pro soutěže, které na chess.cz nejsou (přidané hlášením nebo v aplikaci),
a pro případ, že chess.cz zrovna nejde stáhnout: čte se z jeho exportu do Excelu.

**Hrací místnosti.** Adresu hrací místnosti zadává oddíl na chess.cz a ta je jen na stránce družstva
(`soutez/druzstvo/<soutěž>/<družstvo>/`), tedy dotaz navíc na každé družstvo. Úloha proto každý týden ověří jen
čtvrtinu družstev (podle čísla družstva), ostatním nechá adresu z minula; družstvo bez zjištěné adresy se stáhne vždy.
Za měsíc se tak projdou všechna. chess.cz text zkracuje na 70 znaků, takže se uklidí: bez popisku „Adresa hrací
místnosti:“, bez poznámek o MHD a pravidlech v místnosti a bez useknutého konce (`cleanVenue` ve `scripts/chesscz.mjs`).
Všechna družstva najednou: `node scripts/fetch_data.mjs --all-venues`.

**Aktuální Elo z LOK.** Na soupiskách je Elo z přihlášek na začátku soutěže. Úloha proto při každé aktualizaci
stáhne listinu LOK z [elo.miramal.com](https://elo.miramal.com/) (`lok_sm_cz.xls`) a hráčům přepíše národní Elo
a Elo FIDE na aktuální (`scripts/lok.mjs`). Hráči se párují přesně, ne podle jména (v LOK je spousta jmenovců):
u soupisek z chess.cz podle ID hráče (číslo v odkazu `chess.cz/hrac/<ID>/` je ID v LOK), u soupisek
z chess-results podle FIDE ID. Když hráč v LOK není nebo tam rating nemá, zůstane Elo ze soupisky.
Jméno se z LOK vezme, jen když se od soupisky liší diakritikou nebo tvarem („Kriz, Denis“ → „Kříž Denis“).
Když listina nejde stáhnout, soupisky se uloží s ratingy ze soupisek. Soubor `.xls` (starý formát Excelu)
čte vlastní čtečka `scripts/xls.mjs`, bez knihoven. Ručně jde listina zadat ze souboru:
`node scripts/fetch_data.mjs --lok lok_sm_cz.xls`.

### Přidání všech soutěží kraje nebo celé republiky z chess.cz

**Actions → Přidat soutěže z chess.cz → Run workflow**, vybrat kraj, celostátní soutěže nebo celou republiku
(`scripts/import_chesscz.mjs`). Úloha projde seznam soutěží na chess.cz, u každé zjistí z prvního odehraného kola
počet šachovnic (a z detailu číslo turnaje na chess-results jako zálohu, jen když je ze stejné sezóny), přidá ji
s krajem a jednotnou zkratkou a stáhne soupisky. Soutěže, které v aplikaci už jsou, nechá být.
Když se ještě nehrálo, počet šachovnic jen odhadne
(8) a páteční aktualizace ho doplní, jakmile se odehraje první kolo. Na začátku nové sezóny se úloha spustí
s novým ročníkem.

### Přidání soutěže přímo v aplikaci

Funkce je ve výchozím stavu vypnutá, zapíná se v **Nastavení → Přidání vlastní soutěže**.
Pak je u výběru soutěže tlačítko **Přidat soutěž** a pod ním tři kroky:

1. **Vlož odkaz na soutěž.** Stačí adresa kterékoli stránky té soutěže na chess-results.com.
   Aplikace z ní vezme číslo turnaje a potvrdí, že je v pořádku. Tady se taky zadá počet šachovnic,
   protože ten se z chess-results vyčíst nedá.
2. **Stáhni dva soubory.** Jedno kliknutí a aplikace stáhne oba potřebné exporty sama.
3. **Nahraj je zpátky.** Vyberou se oba najednou a soutěž se přidá.

Soubory jsou dva, protože každý seznam na chess-results se exportuje zvlášť: **Sestava družstva bez
výsledků** nese družstva a soupisky, **Los družstev pro všechna kola** kola a zápasy. Oba se jmenují
`chessResultsList.xlsx`, takže druhý se uloží jako `chessResultsList(1).xlsx`. Na názvech ani pořadí
nezáleží, aplikace pozná podle obsahu, co je v kterém. Stačí i samotné soupisky, pak se jen nevyberou
kola a družstva se zadají ručně; rozlosování jde nahrát kdykoli potom a doplní se k vybrané soutěži.

Takto přidaná soutěž zůstává jen v tom prohlížeči. Aby ji v aplikaci měli všichni, dá se
o ni požádat hlášením na GitHubu podle postupu níže.

**Proč to chodí přes stažení a nahrání, a ne přímo.** chess-results neposílá hlavičku
`Access-Control-Allow-Origin` (ověřeno), takže prohlížeč aplikaci zakáže jeho stránku *přečíst*.
*Stáhnout* soubor ale prohlížeč nebrání, a export posílá hlavičku `content-disposition: attachment`,
takže se rovnou uloží. Načítání přes prostředníka (CORS proxy) tu dřív bylo, ale neprošla ani jedna
z pěti veřejných služeb, a to ani z GitHubu, ani z běžné sítě, ani z mobilních dat, takže bylo
odstraněno. Kdo by ho chtěl, najde ho v historii repozitáře i s připraveným Cloudflare Workerem.

Úloha na GitHubu žádného prostředníka nepotřebuje, protože neběží v prohlížeči, a stahuje přímo.

Export obsahuje všechno, co stránka: pořadí na soupisce, jména, ratingy, kapitány i sloupec **Typ**
(K, ZK, H, V, C), takže kontrola hostů a volných hráčů podle čl. 3.6.3 funguje i touto cestou.
Ověřeno na exportech ÚKŠS i Extraligy. Pokud soutěž typy nepoužívá, nejsou ani na stránce.

Čtečka `.xlsx` je vlastní (`js/xlsx.js`), bez knihoven: soubor je ZIP s XML a rozbaluje se přes
`DecompressionStream`, které umí všechny dnešní prohlížeče. Místo stažených exportů jde nahrát
i uložená stránka `.html` se stejnými seznamy.

### Přidání soutěže pro všechny, přes hlášení

Soutěž přidaná v aplikaci žije jen v jednom zařízení. Aby ji měli všichni, jde o ni požádat:
kdokoli v záložce **Issues** založí
hlášení ze šablony **Přidat soutěž**, vyplní odkaz na turnaj, počet šachovnic a kraj. Úloha
`.github/workflows/nova-soutez.yml` odkaz ověří, přečte ze stránky název soutěže a sezónu, soutěž přidá
do nastavení, stáhne její soupisky a do hlášení odpoví. Do aplikace se soutěž dostane během pár minut.

Odmítne odkaz mimo chess-results.com, turnaj jednotlivců, soutěž, která už v seznamu je,
a nesmyslný počet šachovnic. Soutěž může takhle přidat kdokoli s účtem na GitHubu (nejvýš 250 soutěží).

### Řazení a pojmenování soutěží

Každá soutěž má kraj (`region`: kód svazu, `CR` pro celostátní soutěže), úroveň a jednotnou zkratku se
odvozují z názvu (`js/catalog.js`): Extraliga, 1. liga východ/západ, 2. liga A–F, KP, KP II A, KP III B,
u mládeže s „ml.“ (1. liga ml. A). Nabídka v aplikaci je po skupinách: celostátní soutěže, celostátní soutěže
mládeže, kraje abecedně, vlastní soutěže z tohoto zařízení a ukončené soutěže. Uvnitř skupiny od nejvyšší soutěže
a pak podle skupin. V Nastavení si každý vybere svůj kraj a nabídka ukáže jen celostátní soutěže a ten kraj.
Soutěž, jejíž poslední kolo bylo před víc než 30 dny, je dole mezi ukončenými (zápis z ní jde pořád dodělat).

### Odebrání soutěže

**Actions → Odebrat soutěž → Run workflow** a zadat soutěž (zkratku, id, číslo turnaje nebo odkaz na chess-results).
Spustit to může jen ten, kdo má do repozitáře právo zápisu. Soutěž zmizí z nabídky všem, zápisy v archivech zůstanou,
protože si údaje o soutěži nesou s sebou. Když zadání sedí na víc soutěží (stejná zkratka ve dvou krajích),
nic se nesmaže a úloha je vypíše. Ukončené soutěže není potřeba mazat hned, v nabídce se odsunou samy.

Kdyby se stránky chess.cz nebo chess-results změnily a stahování přestalo fungovat, původní data zůstanou
zachovaná. Stažené stránky se uloží jako příloha běhu v záložce Actions (artefakt `stazene-stranky`), podle nich
jde upravit čtení v `scripts/chesscz.mjs` (chess.cz) nebo `js/parse.js` (chess-results). Soupisky jde vždy doplnit i ručně přímo v aplikaci.

## Nasazení (GitHub Pages)

1. Repozitář → **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch**, větev `main`, složka `/ (root)`.
3. Aplikace pak běží na `https://<účet>.github.io/zapis-o-utkani/`.

## Vývoj a testy

```bash
npm install                 # jen linkedom, pro parsování HTML v Node
npm test                    # 126 testů: logika zápisu, profil, PGN, parser, hrací místnosti, čtečky .xlsx a .xls, ratingy z LOK, přidávání soutěží, archiv, PDF, odkaz s QR
npm run serve               # lokální spuštění: http://localhost:8080
```

Aplikace se nesestavuje a v prohlížeči nemá žádné závislosti kromě převzaté knihovny na QR kód
(`js/vendor/qrcode.js`): čisté HTML, CSS a JavaScript (moduly).

Parser stránek chess-results je jeden, v `js/parse.js`, a sdílí ho aplikace i úlohy na GitHubu.
V prohlížeči pracuje nad `DOMParser`, v Node nad `linkedom`. Záměrně není ve dvou jazycích,
protože právě parser je na celém řešení to nejkřehčí a dvě verze by se časem rozešly.

## Poznámky

- Jména hráčů jsou tak, jak jsou na chess.cz (u soutěží z chess-results tak, jak jsou tam, případně opravená podle LOK).
  V sestavě jdou upravit.
- **Ratingy:** u sdílených soutěží jsou aktuální národní Elo a Elo FIDE z LOK (viz výše), v zápisu jsou kolonky
  `FIDE` a `Nár.`. U soutěží přidaných jen v aplikaci je Elo ze soupisky. Co je na chess-results ve sloupci `Rtg`, závisí na nastavení ve Swiss-Manageru, proto se
  ukládá zvlášť jako neoznačené Elo. V zápisu se vypisují jen kolonky, které v datech opravdu jsou:
  při jediném načteném Elu je tedy jedna kolonka `Elo` a žádná prázdná navíc. Má-li stránka oddělené
  sloupce `RtgN` a `RtgI`, objeví se kolonky `FIDE` a `Nár.`.
- Zápis v PDF je obrázek stránky A4 uložený bezeztrátově (text v něm nejde vyhledávat ani kopírovat). Funguje tak bez internetu a s diakritikou. Prohlížeč, který kvůli ochraně proti sledování blokuje čtení obrázku („canvas“), aplikace pozná a vysvětlí, co dělat.
- Než začnete elektronický zápis používat ostře, ověřte u řídicího orgánu soutěže (ÚKŠS), že ho přijímá, viz čl. 2.4.6
  (způsob a formu zasílání zápisu určují pravidla soutěže).
