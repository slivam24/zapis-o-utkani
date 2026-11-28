// Stránky z menu: O aplikaci (návod, seznam změn, informace) a ochrana osobních údajů. Jen text, bez stavu.

import { CHANGES, VERSION, fmtChangeDate } from './changelog.js';

const REPO_URL = 'https://github.com/slivam24/zapis-o-utkani';

export const ABOUT_TABS = [
  ['navod', 'Návod'],
  ['zmeny', 'Co je nového'],
  ['info', 'O aplikaci'],
];

/**
 * Stránka O aplikaci se třemi záložkami: návod, seznam změn a informace o aplikaci.
 * @param {string} sub záložka (navod, zmeny, info)
 * @param {{seen?: string}} opts seen = naposledy viděná verze; novější dny se v seznamu změn označí
 */
export function aboutPage(sub = 'navod', { seen = '' } = {}) {
  const cur = ABOUT_TABS.some(([id]) => id === sub) ? sub : 'navod';
  const nav = ABOUT_TABS.map(
    ([id, label]) =>
      `<button type="button" role="tab" data-act="aboutTab" data-sub="${id}" class="${id === cur ? 'on' : ''}" aria-selected="${id === cur}">${label}</button>`,
  ).join('');
  const body = cur === 'zmeny' ? changesPage(seen) : cur === 'info' ? infoPage() : helpPage();
  return `<div class="about-nav"><div class="seg" role="tablist" aria-label="O aplikaci">${nav}</div></div>${body}`;
}

/** Seznam změn po dnech, nejnovější nahoře. */
export function changesPage(seen = '') {
  const days = CHANGES.map((c) => {
    const fresh = seen && c.date > seen;
    return `<section class="change-day${fresh ? ' fresh' : ''}">
      <h3>${fmtChangeDate(c.date)}${fresh ? ' <span class="badge new">nové</span>' : ''}</h3>
      <ul>${c.items.map((i) => `<li>${i}</li>`).join('')}</ul>
    </section>`;
  }).join('');
  return `
  <div class="card prose">
    <h2>Co je nového</h2>
    <p class="muted small-text">Změny v aplikaci od nejnovějších. Aplikace se aktualizuje sama, když je zařízení online.</p>
    ${days}
  </div>`;
}

/** Krátce o aplikaci: verze, odkud jsou data, kde nahlásit chybu. */
export function infoPage() {
  return `
  <div class="card prose">
    <h2>O aplikaci</h2>
    <p><b>Zápis o utkání</b> je webová aplikace, která nahrazuje papírový <i>Zápis o konaném šachovém utkání</i>
    v soutěžích družstev Šachového svazu ČR.</p>
    <dl class="about-facts">
      <dt>Verze</dt><dd>${fmtChangeDate(VERSION)} <button class="link-btn" type="button" data-act="aboutTab" data-sub="zmeny">co je nového</button></dd>
      <dt>Soupisky a rozlosování</dt><dd>ze stránek svazu <a href="https://www.chess.cz/souteze/vyber-kraje/" target="_blank" rel="noopener">chess.cz</a>,
      u několika soutěží z <a href="https://chess-results.com" target="_blank" rel="noopener">chess-results.com</a>; obnovují se každý pátek</dd>
      <dt>Aktuální Elo</dt><dd>z listiny LOK (<a href="https://elo.miramal.com/" target="_blank" rel="noopener">elo.miramal.com</a>)</dd>
      <dt>Server</dt><dd>žádný: zápisy zůstávají v zařízení, viz <button class="link-btn" type="button" data-act="go" data-tab="soukromi">Ochrana osobních údajů</button></dd>
      <dt>Zdrojový kód</dt><dd><a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>, aplikace běží na GitHub Pages</dd>
    </dl>

    <h3>Chyba, nápad nebo chybějící soutěž</h3>
    <p>Na GitHubu v záložce <a href="${REPO_URL}/issues" target="_blank" rel="noopener">Issues</a> založ hlášení.
    Pro chybějící soutěž je připravené hlášení <b>Přidat soutěž</b>: soutěž se pak do pár minut objeví v aplikaci všem.
    U chyby pomůže, co jsi dělal, na jakém zařízení a v jakém prohlížeči.</p>

    <h3>Použité knihovny</h3>
    <p class="small-text">QR kód kreslí <a href="https://github.com/kazuhikoarase/qrcode-generator" target="_blank" rel="noopener">qrcode-generator</a>
    (Kazuhiko Arase, licence MIT). Všechno ostatní, včetně PDF, je přímo v aplikaci.</p>

    <h3>Upozornění</h3>
    <p class="small-text">Ověřte u řídicího orgánu soutěže, že elektronický zápis přijímá (čl. 2.4.6 soutěžního řádu:
    způsob a formu zasílání zápisu určují pravidla soutěže).</p>
  </div>`;
}

/** Návod: rychlý start, jednotlivé kroky, tipy a časté potíže. */
export function helpPage() {
  return `
  <div class="card prose">
    <h2>Návod</h2>
    <p>Aplikace nahrazuje papírový <b>Zápis o konaném šachovém utkání</b>. Zápis se vyplní na tabletu,
    telefonu nebo počítači, podepíše se na displeji a na konci vznikne PDF (a obrázek), které se pošle řídicímu soutěže.</p>

    <h3>Rychlý start</h3>
    <ol>
      <li>Před utkáním, ještě s internetem, aplikaci otevři a vyber soutěž. Soupisky se uloží do zařízení
      a v hrací místnosti pak aplikace funguje i bez internetu.</li>
      <li>Projdi pět kroků v liště nahoře: <b>Zápas → Sestavy → Výsledky → Závěr a podpisy → Výstup</b>.</li>
      <li>Na konci stáhni nebo odešli PDF a zápis ulož do archivu.</li>
    </ol>
    <p>Mezi kroky jde kdykoli přeskakovat. Rozpracovaný zápis se ukládá průběžně, nic se neztratí ani po zavření aplikace.</p>

    <h3>1. Zápas</h3>
    <ul>
      <li>Vyber <b>soutěž</b> a <b>kolo</b>, pak klepni na zápas z rozlosování. Družstva a datum se doplní sama.</li>
      <li>Dopiš <b>hrací místnost</b>. Příště se u stejného domácího družstva doplní sama.</li>
      <li>Počet šachovnic se bere ze soutěže, v zápisu ho jde změnit.</li>
    </ul>

    <h3>2. Sestavy</h3>
    <ul>
      <li>Zaškrtni hráče ze soupisky obou družstev (až 8, v soutěžích na 5 šachovnicích až 5).
      Šachovnice se přidělí podle pořadí na soupisce (čl. 3.6.2).</li>
      <li>Aplikace hlídá nejmenší počet hráčů a upozorní, když je hostů, volných hráčů a cizinců víc,
      než soutěžní řád dovoluje (8 šachovnic: nejvýše 3, 5 šachovnic: nejvýše 2).</li>
      <li>Tužkou u hráče opravíš jméno nebo Elo. Hráče, který na soupisce chybí, přidáš pod soupiskou
      (<i>Přidat hráče, který není v soupisce</i>).</li>
      <li>Typy hráčů: <b>K</b> kapitán, <b>ZK</b> zástupce kapitána, <b>H</b> host, <b>V</b> volný hráč, <b>C</b> cizinec.</li>
    </ul>

    <h3>3. Výsledky</h3>
    <ul>
      <li>Klepni na šachovnici a vyber výsledek: <b>1 : 0</b>, <b>½ : ½</b>, <b>0 : 1</b>
      nebo kontumaci <b>1K : 0K</b>, <b>0K : 1K</b>, <b>0K : 0K</b>.</li>
      <li>Skóre se sčítá samo a nahoře je vidět, jestli je průběžné, nebo konečné.
      Neobsazené šachovnice se doplní jako kontumace samy.</li>
      <li>Tlačítko <b>Celá obrazovka</b> ukáže velký přehled průběhu utkání, čitelný i z dálky (tablet u stolu,
      monitor v hrací místnosti). Odtud jde přepnout i na celý zápis.</li>
    </ul>

    <h3>4. Závěr a podpisy</h3>
    <ul>
      <li>Vyplň <b>rozhodčího</b> (jde vybrat i ze soupisky) a <b>kapitány</b>.</li>
      <li>Do <b>záznamu rozhodčího</b> napiš připomínky. Tlačítka s rychlými texty vloží nejčastější věty.</li>
      <li>Kapitán domácích, rozhodčí a kapitán hostů se podepíšou prstem nebo perem do tří polí.</li>
    </ul>

    <h3>5. Výstup</h3>
    <ul>
      <li><b>Kontrola zápisu</b> ukáže, co je nutné opravit a co jen doporučujeme doplnit, s odkazem na příslušný krok.</li>
      <li>Klepnutím na náhled se zápis zobrazí na celou obrazovku.</li>
      <li><b>Stáhnout PDF</b>, případně obrázek (PNG), <b>Sdílet</b> nebo <b>Odeslat e-mailem</b>.
      Adresa příjemce se pamatuje pro každou soutěž.</li>
      <li>Loga v zápisu (svaz, krajský svaz, družstva) jde nahrát a každé vypnout.</li>
      <li><b>Uložit do archivu a začít nový</b> zápis uloží a otevře prázdný.</li>
    </ul>

    <h3>Podpisy, když zápis vyplňuješ na počítači</h3>
    <p>Myší se podepisuje špatně. V kroku <b>Závěr a podpisy</b> klepni na <b>Podepsat na telefonu</b>: ukáže se QR kód.
    Načti ho fotoaparátem telefonu a zápis se v telefonu otevře rovnou u podpisů. Oba kapitáni a rozhodčí se podepíšou prstem
    a zápis se odešle z telefonu. Nic se neposílá přes internet, zápis je přímo v QR kódu. Loga družstev nahraná
    na počítači se do telefonu nepřenesou.</p>

    <h3>Nabídka soutěží</h3>
    <p>Soutěže jsou rozdělené do skupin: celostátní soutěže, celostátní soutěže mládeže a kraje. Uvnitř skupiny
    jdou od nejvyšší soutěže (Extraliga, 1. liga, 2. liga, KP, KP II, KP III) a pak podle skupin A, B, C.
    V <b>Můj profil → Moje kraje</b> si nabídku zúžíš na celostátní soutěže a své kraje. Oblíbené soutěže
    (hvězdička ☆ u soutěže) jsou v nabídce úplně nahoře. Soutěže, které už skončily,
    jsou dole mezi ukončenými, zápis z nich jde pořád dodělat. Soupisky se obnovují každý pátek,
    ručně je obnovíš ikonou ↻ v hlavičce.</p>

    <h3>Soutěž, která v nabídce není</h3>
    <p>Pro všechny: na GitHubu v repozitáři aplikace založ v záložce <b>Issues</b> hlášení <b>Přidat soutěž</b>
    (odkaz na chess-results, počet šachovnic, kraj). Soutěž se do pár minut objeví v aplikaci všem.</p>
    <p>Jen pro sebe: v Nastavení zapni <b>Přidání vlastní soutěže</b>. U výběru soutěže se objeví tlačítko
    <b>+ Přidat soutěž</b>: vložíš odkaz na soutěž na chess-results, aplikace stáhne dva soubory a ty je nahraješ zpátky.</p>

    <h3>Archiv</h3>
    <p>Hotový zápis ulož tlačítkem <b>Uložit do archivu a začít nový</b> na konci. Archiv je jen v tomto zařízení,
    proto si ho občas stáhni do souboru (<b>Archiv → Stáhnout zálohu</b>). Soubor jde nahrát zpátky
    na stejném nebo jiném zařízení, zápisy se sloučí bez duplicit.</p>
    <p><b>iPhone a iPad:</b> Safari maže data webů, které týden nikdo neotevřel, a s nimi i archiv.
    Neplatí to pro aplikaci přidanou na plochu (<b>Sdílet → Přidat na plochu</b>), proto ji tak používej
    a zálohu stahuj i tak. Při prvním uložení do archivu aplikace požádá prohlížeč, aby její data nemazal sám.</p>

    <h3>Můj profil</h3>
    <p>V <b>☰ Menu → Můj profil</b> si vybereš kraje, oblíbené soutěže a svoje družstva. Po výběru kola aplikace
    sama vybere zápas tvého družstva. Nastavíš tam i, která loga jsou v novém zápisu zapnutá
    (logo družstva třeba jen u tvého družstva), a jednou se podepíšeš: v kroku Závěr a podpisy pak stačí
    klepnout na <b>Vložit můj podpis</b>. Profil i s logy jde stáhnout do souboru a nahrát na jiném zařízení.
    Podpis se do souboru přidá, jen když ho zaškrtneš.</p>

    <h3>Nastavení a zobrazení</h3>
    <p>Funkce, které nejsou potřeba pokaždé (vlastní soutěže, loga, e-mail, rychlé texty záznamu…),
    jde v <b>Nastavení</b> vypnout. Zápis je pak jednodušší. Vypnutím se nic nesmaže, funkci jde kdykoli zase zapnout.</p>
    <p>Aplikace má dvě zobrazení: <b>Počítač</b> (hustší ovládání) a <b>Tablet a mobil</b> (velké dotykové prvky).
    Vybere si samo podle zařízení, v Nastavení jde přepnout ručně.</p>

    <h3>Instalace na plochu</h3>
    <p>Aplikaci jde „nainstalovat“ jako ikonu na plochu: na Androidu v Chromu <i>Přidat na plochu</i> nebo <i>Instalovat aplikaci</i>,
    na iPhonu a iPadu v Safari <i>Sdílet → Přidat na plochu</i>. Pak se otevírá jako samostatná aplikace a funguje bez internetu.</p>

    <h3>Časté potíže</h3>
    <ul>
      <li><b>Chybí soupiska nebo je stará:</b> klepni na ↻ v hlavičce (potřebuje internet). Soupisky na chess.cz
      se do aplikace dostanou při páteční aktualizaci.</li>
      <li><b>PDF je prázdné nebo zelené:</b> prohlížeč blokuje čtení obrázku kvůli ochraně proti sledování.
      Aplikace to pozná a poradí, co povolit, případně použij jiný prohlížeč.</li>
      <li><b>Úložiště zařízení je plné:</b> aplikace ukáže červenou lištu. Stáhni zálohu archivu a staré zápisy smaž.</li>
      <li><b>Telefon po načtení QR kódu ukázal jiný zápis:</b> běžel na starší verzi aplikace. Ta se po načtení odkazu
      obnoví sama; když ne, aplikaci v telefonu zavři a QR kód načti znovu.</li>
      <li><b>Lišta „Je připravená nová verze“:</b> klepni na <b>Načíst</b>, rozpracovaný zápis zůstane.</li>
    </ul>
  </div>`;
}

export function privacyPage() {
  return `
  <div class="card prose">
    <h2>Ochrana osobních údajů</h2>
    <p><b>Aplikace nemá žádný server.</b> Všechno, co do ní zadáte, zůstává v prohlížeči zařízení,
    na kterém zápis vyplňujete. Autor aplikace k vašim zápisům nemá přístup.</p>

    <h3>Co se ukládá do zařízení</h3>
    <ul>
      <li>rozpracovaný zápis a archiv hotových zápisů, včetně podpisů,</li>
      <li>naposledy použití rozhodčí a hrací místnosti (aby se příště nabídly),</li>
      <li>nahraná loga, adresa pro odeslání zápisu e-mailem a nastavení aplikace,</li>
      <li>profil: kraje, oblíbené soutěže, moje družstva, jméno a můj podpis (pokud si ho uložíte).</li>
    </ul>

    <h3>Kam se data posílají</h3>
    <ul>
      <li>Nikam, dokud zápis sami nepošlete e-mailem nebo nesdílíte. E-mail odchází z vaší pošty.</li>
      <li>Soupisky se stahují z veřejných stránek svazu chess.cz (u několika soutěží z chess-results.com):
      jména, Elo, typ hráče a jméno kapitána.
      Kontakty kapitánů ani identifikátory FIDE aplikace neukládá.</li>
      <li>Při podpisu na telefonu je zápis (bez podpisů) přímo v QR kódu a v odkazu, který telefon otevře.
      Část odkazu se zápisem prohlížeč na server neposílá, odkaz ale zůstane v historii prohlížeče telefonu.</li>
      <li>Aplikaci hostuje GitHub Pages. Jako každý web zaznamenává adresy návštěvníků.
      Aplikace nepoužívá cookies ani měření návštěvnosti.</li>
    </ul>

    <h3>Podpisy</h3>
    <p>Podpis se ukládá jen jako obrázek čáry, stejně jako na papírovém zápisu.
    Neukládá se tlak, rychlost ani průběh tahu. Podpis je součástí zápisu (PDF), který se odesílá řídicímu soutěže.</p>
    <p>Můj podpis z profilu je uložený v zařízení a do zápisu se vloží jen klepnutím na <b>Vložit můj podpis</b>.
    Na sdíleném zařízení (klubový tablet) ho proto neukládejte, nebo ho po utkání v profilu smažte.
    Do souboru s profilem se podpis dostane, jen když to při stažení zaškrtnete. S takovým souborem zacházejte opatrně.</p>

    <h3>Jak dlouho a jak smazat</h3>
    <ul>
      <li>Zápis se archivuje nejméně 6 měsíců (čl. 2.4.6 soutěžního řádu).
      Archiv upozorní na zápisy starší než lhůta zvolená v Nastavení a nabídne jejich smazání.</li>
      <li>Jednotlivý zápis smažete v Archivu, všechna data aplikace v <b>Nastavení → Smazat všechna data</b>.</li>
      <li>Na sdíleném zařízení (klubový tablet) vidí archiv každý, kdo aplikaci otevře.
      Zvažte proto stažení zálohy a smazání archivu po skončení sezóny.</li>
    </ul>

    <h3>Kdo za údaje odpovídá</h3>
    <p>Zápis vede a údaje v něm zpracovává oddíl nebo rozhodčí utkání pro potřeby soutěže,
    stejně jako u papírového zápisu. Aplikace je jen nástroj, který to usnadňuje.</p>
  </div>`;
}
