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

Kdyby se stránka chess-results změnila a stahování přestalo fungovat, původní data zůstanou zachovaná.
Stažené stránky se uloží jako příloha běhu v záložce Actions (artefakt `stazene-stranky`), podle nich jde upravit
parser v `scripts/fetch_data.py`. Soupisky jde vždy doplnit i ručně přímo v aplikaci.

## Nasazení (GitHub Pages)

1. Repozitář → **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch**, větev `main`, složka `/ (root)`.
3. Aplikace pak běží na `https://<účet>.github.io/zapis-o-utkani/`.

## Vývoj a testy

```bash
npm test                                  # logika zápisu (Node 20+)
pip install -r scripts/requirements.txt
python -m unittest tests/test_fetch_data.py   # parser chess-results
python3 -m http.server 8080               # lokální spuštění: http://localhost:8080
```

Bez sestavování, bez závislostí: čisté HTML, CSS a JavaScript (moduly).

## Poznámky

- Jména hráčů jsou tak, jak jsou na chess-results (bez diakritiky). V sestavě jdou upravit.
- Sloupec `Rtg` z chess-results se bere jako **národní** rating. FIDE rating lze doplnit ručně u hráče v sestavě.
- Zápis v PDF je obrázek stránky A4 (text v něm nejde vyhledávat ani kopírovat). Funguje tak bez internetu a s diakritikou.
- Než začnete elektronický zápis používat ostře, ověřte u řídicího orgánu soutěže (ÚKŠS), že ho přijímá, viz čl. 2.4.6
  (způsob a formu zasílání zápisu určují pravidla soutěže).
