# Zápis o utkání

Webová aplikace, která nahrazuje papírový „Zápis o konaném šachovém utkání“. Soupisky družstev se načítají
z [chess-results.com](https://chess-results.com), zápis se vyplňuje na telefonu nebo tabletu, podepisuje se
prstem a na konci vznikne **PDF** a **obrázek (PNG)** zápisu.

## Postup při utkání

1. **Zápas:** vyber soutěž, kolo a zápas (nebo rovnou domácí a hostující družstvo), datum a hrací místnost.
2. **Sestavy:** zaškrtni hráče ze soupisky (až 8, v KP III až 5). Šachovnice se přidělují podle pořadí na soupisce.
   Aplikace hlídá limit hostů, volných hráčů a cizinců (čl. 3.6.3) a nejmenší počet hráčů (čl. 3.6.2).
3. **Výsledky:** `1 : 0`, `½ : ½`, `0 : 1` a kontumace `1K : 0K`, `0K : 0K`, `0K : 1K`.
   Neobsazené šachovnice se doplní jako kontumace samy. Součet se počítá automaticky.
4. **Závěr a podpisy:** rozhodčí, kapitáni, záznam rozhodčího a tři podpisy.
5. **Výstup:** kontrola zápisu, náhled, PDF, PNG, sdílení. Hotový zápis jde uložit do archivu v zařízení.

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

Soubor `data/competitions.json` drží soupisky a rozlosování soutěží ze `scripts/competitions.json`.
Obnoví se spuštěním úlohy **Actions → Aktualizace soupisek → Run workflow** a sám po přidání soutěže
z hlášení. Pravidelné spouštění nastavené není: soutěž si každý umí přidat přímo v aplikaci, takže
stačí data obnovit, když je potřeba.

Soutěže se nastavují v `scripts/competitions.json` (číslo turnaje na chess-results, počet šachovnic).

### Přidání soutěže přímo v aplikaci

U výběru soutěže je tlačítko **Přidat soutěž** a pod ním tři kroky:

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
hlášení ze šablony **Přidat soutěž**, vyplní odkaz na turnaj a počet šachovnic. Úloha
`.github/workflows/nova-soutez.yml` odkaz ověří, přečte ze stránky název soutěže a sezónu, soutěž přidá
do nastavení, stáhne její soupisky a do hlášení odpoví. Do aplikace se soutěž dostane během pár minut.

Odmítne odkaz mimo chess-results.com, turnaj jednotlivců, soutěž, která už v seznamu je,
a nesmyslný počet šachovnic. Nevhodný záznam se smaže řádkem v `scripts/competitions.json`.

Kdyby se stránka chess-results změnila a stahování přestalo fungovat, původní data zůstanou zachovaná.
Stažené stránky se uloží jako příloha běhu v záložce Actions (artefakt `stazene-stranky`), podle nich jde upravit
parser v `scripts/fetch_data.mjs`. Soupisky jde vždy doplnit i ručně přímo v aplikaci.

## Nasazení (GitHub Pages)

1. Repozitář → **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch**, větev `main`, složka `/ (root)`.
3. Aplikace pak běží na `https://<účet>.github.io/zapis-o-utkani/`.

## Vývoj a testy

```bash
npm install                 # jen linkedom, pro parsování HTML v Node
npm test                    # 55 testů: logika zápisu, parser, čtečka .xlsx, přidávání soutěží
npm run serve               # lokální spuštění: http://localhost:8080
```

Aplikace se nesestavuje a v prohlížeči nemá žádné závislosti: čisté HTML, CSS a JavaScript (moduly).

Parser stránek chess-results je jeden, v `js/parse.js`, a sdílí ho aplikace i úlohy na GitHubu.
V prohlížeči pracuje nad `DOMParser`, v Node nad `linkedom`. Záměrně není ve dvou jazycích,
protože právě parser je na celém řešení to nejkřehčí a dvě verze by se časem rozešly.

## Poznámky

- Jména hráčů jsou tak, jak jsou na chess-results. V sestavě jdou upravit.
- **Ratingy:** co je na chess-results ve sloupci `Rtg`, závisí na nastavení ve Swiss-Manageru, proto se
  ukládá zvlášť jako neoznačené Elo. V zápisu se vypisují jen kolonky, které v datech opravdu jsou:
  při jediném načteném Elu je tedy jedna kolonka `Elo` a žádná prázdná navíc. Má-li stránka oddělené
  sloupce `RtgN` a `RtgI`, objeví se kolonky `FIDE` a `Nár.`.
- Zápis v PDF je obrázek stránky A4 (text v něm nejde vyhledávat ani kopírovat). Funguje tak bez internetu a s diakritikou.
- Než začnete elektronický zápis používat ostře, ověřte u řídicího orgánu soutěže (ÚKŠS), že ho přijímá, viz čl. 2.4.6
  (způsob a formu zasílání zápisu určují pravidla soutěže).
