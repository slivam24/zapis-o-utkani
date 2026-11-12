// Stránky z menu: nápověda a ochrana osobních údajů. Jen text, bez stavu.

export function helpPage() {
  return `
  <div class="card prose">
    <h2>Nápověda</h2>
    <p>Aplikace nahrazuje papírový <b>Zápis o konaném šachovém utkání</b>. Zápis se vyplní na tabletu,
    telefonu nebo počítači, podepíše se na displeji a na konci vznikne PDF (a obrázek), které se pošle dál.</p>

    <h3>Zápis v pěti krocích</h3>
    <ol>
      <li><b>Zápas:</b> vyber soutěž a kolo, pak klepni na zápas z rozlosování. Datum se doplní samo,
      stačí dopsat hrací místnost (příště se doplní sama).</li>
      <li><b>Sestavy:</b> zaškrtni hráče ze soupisky obou družstev. Šachovnice se přidělí podle pořadí na soupisce.
      Aplikace hlídá počet hráčů a hostů, volných hráčů a cizinců.</li>
      <li><b>Výsledky:</b> klepni na šachovnici a vyber výsledek. Neobsazené šachovnice se doplní jako kontumace samy.
      Tlačítko <b>Celá obrazovka</b> ukáže velký přehled utkání, třeba na tabletu u stolu.</li>
      <li><b>Závěr a podpisy:</b> rozhodčí (jde vybrat i ze soupisky), kapitáni, záznam rozhodčího a tři podpisy.</li>
      <li><b>Výstup:</b> kontrola zápisu, náhled, stažení PDF, odeslání e-mailem a uložení do archivu.</li>
    </ol>
    <p>Mezi kroky jde kdykoli přeskakovat lištou nahoře. Rozpracovaný zápis se ukládá průběžně, nic se neztratí ani po zavření.</p>

    <h3>Co aplikace umí</h3>
    <ul>
      <li>Soupisky a rozlosování krajských soutěží z chess-results.com, obnovují se každý pátek. Ručně je obnovíš ikonou ↻ v hlavičce.</li>
      <li>Funguje i bez internetu (po prvním otevření). Jde „nainstalovat“ na plochu: v prohlížeči <i>Přidat na plochu</i>.</li>
      <li>Kontumace <b>1K : 0K</b>, <b>0K : 1K</b> a <b>0K : 0K</b>, typy hráčů K, ZK, H, V a C.</li>
      <li>Kontrola podle soutěžního řádu: hráči v pořadí soupisky, nejméně polovina hráčů,
      hosté, volní hráči a cizinci v menšině (8 šachovnic: nejvýše 3, 5 šachovnic: nejvýše 2).</li>
      <li>Loga svazu, krajského svazu a družstev v zápisu.</li>
      <li>Archiv zápisů s exportem a importem do souboru.</li>
      <li>Dvě zobrazení: pro počítač a pro tablet a mobil. Aplikace vybere samo, přepnout jde v Nastavení.</li>
    </ul>

    <h3>Nastavení</h3>
    <p>Funkce, které nejsou potřeba pokaždé (vlastní soutěže, loga, e-mail, rychlé texty záznamu…),
    jde v <b>Nastavení</b> vypnout. Zápis je pak jednodušší. Vypnutím se nic nesmaže, funkci jde kdykoli zase zapnout.</p>

    <h3>Soutěž, která v nabídce není</h3>
    <p>V Nastavení zapni <b>Přidání vlastní soutěže</b>. U výběru soutěže se objeví tlačítko <b>+ Přidat soutěž</b>:
    vložíš odkaz na soutěž na chess-results, aplikace stáhne dva soubory a ty je nahraješ zpátky.</p>

    <h3>Archiv</h3>
    <p>Hotový zápis ulož tlačítkem <b>Uložit do archivu</b> na konci. Archiv je jen v tomto zařízení,
    proto si ho občas stáhni do souboru (<b>Archiv → Stáhnout zálohu</b>). Soubor jde nahrát zpátky
    na stejném nebo jiném zařízení, zápisy se sloučí bez duplicit.</p>

    <h3>Než začnete zápis používat naostro</h3>
    <p>Ověřte u řídicího orgánu soutěže, že elektronický zápis přijímá (čl. 2.4.6 soutěžního řádu:
    způsob a formu zasílání zápisu určují pravidla soutěže).</p>
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
      <li>nahraná loga, adresa pro odeslání zápisu e-mailem a nastavení aplikace.</li>
    </ul>

    <h3>Kam se data posílají</h3>
    <ul>
      <li>Nikam, dokud zápis sami nepošlete e-mailem nebo nesdílíte. E-mail odchází z vaší pošty.</li>
      <li>Soupisky se stahují z veřejných stránek chess-results.com: jména, rating, typ hráče a jméno kapitána.
      Kontakty kapitánů ani identifikátory FIDE aplikace neukládá.</li>
      <li>Aplikaci hostuje GitHub Pages. Jako každý web zaznamenává adresy návštěvníků.
      Aplikace nepoužívá cookies ani měření návštěvnosti.</li>
    </ul>

    <h3>Podpisy</h3>
    <p>Podpis se ukládá jen jako obrázek čáry, stejně jako na papírovém zápisu.
    Neukládá se tlak, rychlost ani průběh tahu. Podpis je součástí zápisu (PDF), který se odesílá řídicímu soutěže.</p>

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
