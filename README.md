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

Soubor `data/competitions.json` se **každý pátek automaticky aktualizuje** (GitHub Actions,
`.github/workflows/update-data.yml`). Jde ho spustit i ručně: záložka **Actions → Aktualizace soupisek → Run workflow**.
Ve výchozím stavu jsou v repozitáři soupisky Krajského přeboru z 2. 11. 2026.

Soutěže se nastavují v `scripts/competitions.json` (číslo turnaje na chess-results, počet šachovnic).

### Přidání soutěže přímo v aplikaci

U výběru soutěže je tlačítko **Přidat soutěž**: vloží se odkaz na turnaj z chess-results a počet
šachovnic, aplikace načte název, sezónu, soupisky i rozlosování a soutěž uloží do zařízení.
Takto přidaná soutěž zůstává jen v tom prohlížeči, do sdílených dat se nedostane.

**Načítání potřebuje prostředníka.** chess-results neposílá hlavičku `Access-Control-Allow-Origin`
(ověřeno), takže prohlížeč si jeho stránku stáhnout nesmí. Aplikace proto čte přes proxy:

- Ve výchozím stavu zkouší veřejné služby. **Jsou nespolehlivé.** Při zkoušce z GitHubu neprošla
  ani jedna z pěti (vypršení času, HTTP 401, odmítnuté spojení). Zkouška ale běží v datovém centru,
  jehož adresy tyhle služby běžně blokují, takže z běžného prohlížeče fungovat mohou. Ověř si to
  jedním pokusem přímo v aplikaci.
- **Spolehlivé řešení je vlastní prostředník**, viz [worker/README.md](worker/README.md). Kód pro
  Cloudflare Workers je připravený, nasazení je na pár kliknutí a je zdarma. Adresa se vloží
  v aplikaci v **Nastavení načítání** a má přednost před veřejnými službami.
- Když načtení neprojde, dá se soutěž **nahrát ze souboru** (viz níže) nebo požádat o její přidání
  **hlášením na GitHubu** podle postupu dál.

Jestli načítání funguje, se dá kdykoli přeměřit úlohou **Ověření načítání soutěží** v záložce Actions.
Do pole proxy se dá zadat vlastní adresa.

### Nahrání soutěže ze souboru (bez prostředníka)

Nejjednodušší cesta, když načítání přes odkaz nefunguje, a funguje i úplně bez internetu:

1. Na chess-results zobraz **Sestava družstva bez výsledků** a dole klikni na **Export do Excelu (.xlsx)**.
2. V aplikaci otevři **Přidat soutěž**, rozbal **Když načtení nefunguje** a soubor nahraj.
3. Chceš-li i výběr kola a zápasu, stáhni stejně i export seznamu **Los družstev pro všechna kola**
   a nahraj oba soubory najednou. Pořadí nerozhoduje, aplikace sama pozná, co je v kterém.

Export obsahuje všechno, co stránka: pořadí na soupisce, jména, ratingy, kapitány i sloupec **Typ**
(K, ZK, H, V, C), takže kontrola hostů a volných hráčů podle čl. 3.6.3 funguje i touto cestou.
Ověřeno na exportech ÚKŠS i Extraligy. Pokud soutěž typy nepoužívá, nejsou ani na stránce.

Čtečka `.xlsx` je vlastní (`js/xlsx.js`), bez knihoven: soubor je ZIP s XML a rozbaluje se přes
`DecompressionStream`, které umí všechny dnešní prohlížeče. Místo exportu jde nahrát i uložená
stránka `.html`.

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
parser v `scripts/fetch_data.py`. Soupisky jde vždy doplnit i ručně přímo v aplikaci.

## Nasazení (GitHub Pages)

1. Repozitář → **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch**, větev `main`, složka `/ (root)`.
3. Aplikace pak běží na `https://<účet>.github.io/zapis-o-utkani/`.

## Vývoj a testy

```bash
npm install                 # jen linkedom, pro parsování HTML v Node
npm test                    # 52 testů: logika zápisu, parser, čtečka .xlsx, přidávání soutěží
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
