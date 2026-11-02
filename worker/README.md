# Vlastní prostředník pro načítání soupisek

Aplikace si stránku z chess-results.com nemůže stáhnout přímo, protože server neposílá hlavičku
`Access-Control-Allow-Origin` a prohlížeč čtení zakáže. Ve výchozím stavu aplikace používá veřejné
služby, které to obcházejí. Jsou zdarma, ale mohou přestat fungovat nebo omezit počet požadavků.

Spolehlivější je vlastní prostředník. Soubor `worker.js` je připravený pro Cloudflare Workers,
kde je zdarma (100 000 požadavků denně, což je pro tohle použití mnohonásobně víc, než je třeba).

## Nasazení přes web, bez instalování

1. Založ si účet na <https://dash.cloudflare.com> a v levém menu zvol **Workers & Pages**.
2. **Create** a **Create Worker**, pojmenuj ho třeba `zapis-chess-results` a dej **Deploy**.
3. Klikni na **Edit code**, obsah smaž a vlož celý obsah souboru `worker.js`.
4. V poli `ALLOWED_ORIGINS` nech `https://slivam24.github.io`, případně doplň další adresu,
   odkud aplikaci otevíráš.
5. **Deploy**. Nahoře se objeví adresa ve tvaru `https://zapis-chess-results.tvuj-ucet.workers.dev`.

## Zapojení v aplikaci

V aplikaci otevři **Přidat soutěž**, dole **Nastavení načítání** a vlož adresu i se zástupným textem:

```
https://zapis-chess-results.tvuj-ucet.workers.dev/?url={url}
```

Můžeš jich zadat víc, každou na samostatný řádek. Zkoušejí se v pořadí shora dolů, takže vlastní
worker patří na první řádek a veřejná služba pod něj jako záloha. Prázdné pole znamená použít výchozí
veřejné služby.

## Proč je worker omezený jen na chess-results

Kdyby přes něj šlo stáhnout jakoukoli stránku, stala by se z něj otevřená proxy, kterou by mohl
zneužít kdokoli. Proto propustí jen `https://chess-results.com` a odpovídá jen adresám v `ALLOWED_ORIGINS`.
Odpovědi se patnáct minut drží v mezipaměti, aby se chess-results zbytečně nezatěžoval.
