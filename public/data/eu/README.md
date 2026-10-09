# EU-källtexter

Importdatum och versioner finns i `index.json`. Denna import prövade 93 EU-akter som FFFS-katalogen hänvisar till. 84 svenska texter kunde importeras: 58 daterade konsolideringar och 26 uttryckligen märkta grundakter. Alla 4 670 artikelavsnitt har stabila artikelankare. Ingress, kapitel och bilagor finns också i dokumentets fulltext och `sections`.

Grundakter är ursprungliga lydelser och får inte automatiskt betraktas som aktuella. `versionSelection`, `notes` och `failures` redovisar varje reservfall. Konsolideringar valdes genom CELLAR:s uppgift `act_consolidated_date` och datumet 2026-10-09. `inForce` är metadata som CELLAR rapporterade vid hämtningen, inte en historisk juridisk bedömning. Konsolideringar har ingen egen rättsverkan.

Original-HTML sparas med filändelsen `.html.txt` för inaktiv textvisning. Dess officiella slut-URL, SHA-256 och hämtningstid bevaras. Den maskinbearbetade lästexten är en hjälp; tabeller med sammanfogade celler, formler, fotnoter och layout ska kontrolleras mot originalet. Ingen språkfallback, OCR eller automatisk omskrivning har gjorts. Källornas innehåll är offentligt EU-material och återanvänds med hänvisning till officiell källa.

- Officiell åtkomst: https://op.europa.eu/en/web/cellar/cellar-data
- Återanvändningsvillkor: https://eur-lex.europa.eu/content/help/content/help/data-reuse/reuse-contents-eurlex-details.html?locale=en
- Konsolideringars status: https://eur-lex.europa.eu/collection/eu-law/consleg.html?locale=en
- OSS-förkontroll: https://github.com/cyanheads/eur-lex-mcp-server/tree/v0.18.2

Importen använder dokumenterad offentlig CELLAR-åtkomst och projektets befintliga htmlparser2. Ingen åtkomstutmaning löses eller kringgås. Metadatafrågorna är sparade i `metadata-*.json`. Textimporten använder svenska HTML-manifestationer; äldre okända format och källfiler över den avsiktliga 40 MB-gränsen redovisas som luckor.

Kör från repo: `npx tsx scripts/import-eurlex.ts --as-of 2026-10-09 --refresh`. Utan `--refresh` återanvänds matchande importer. `--limit N` kan användas för ett litet separat provurval men skriver också om indexets urval. Inga API-nycklar behövs.

`quality-report.json` redovisar kontrollresultat. EU-sökindexet innehåller fulltext och ska laddas först när fulltextsökning behövs. `index.json` räcker för bläddring och sökning i rubriker. Hämtaren använder fem minuters cache, fasta betrodda basadresser och storleksgränser.
