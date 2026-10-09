# FFFS-bibliotek

Ett fristående, öppet läs- och sökbibliotek för Finansinspektionens föreskrifter och allmänna råd.

- **Webbplats:** https://nic-esp.github.io/fffs-bibliotek/
- **Publik MCP:** https://fffs-public-mcp.vercel.app/mcp
- **Maskinläsbart register:** https://nic-esp.github.io/fffs-bibliotek/data/catalog.json

Varje författning har en statisk HTML-sida, Markdown, JSON och PDF. Listan kan filtreras på institutionstyp, kategori, status, år och utgåva. Fulltextsökningen och den publika MCP-servern använder samma korpus. Inloggning krävs inte; MCP har enbart läsverktyg.

## Underlag och kvalitet

Utgåvan är daterad **2026-10-09**. Den innehåller 130 författningsakter: 75 i korrigerat gällande urval, tre kommande, två upphävda och 50 upphävningsakter. Fem felaktiga statusklassificeringar i det ursprungliga underlaget har rättats. Fyra egenkonsoliderade texter/PDF:er har fått riktade innehållsrättningar. Bilagor och formler har bevarats i PDF.

Detta är inte en officiell författningssamling eller ett intyg om juridisk fullständighet. Lästexter som extraherats från PDF kan innehålla konverteringsfel. Kontrollera tabeller, formler och rättsligt avgörande detaljer i källorna. Vissa konsolideringar innehåller både nuvarande och uttryckligen daterade framtida lydelser. Institutionstaggar är sökhjälp med källbelägg och avgränsningar, inte ett automatiskt besked om tillämplighet. EU-relationerna skiljer genomförande, komplettering och hänvisningar; tom lista innebär ingen kartlagd relation.

Granskningsrapporter finns i `provenance/`. Rapporterna hänvisar ibland till lokalt arbetsmaterial och bilder som inte ingår i detta repo. `public/data/provenance.json` ger SHA-256 för de publicerade PDF- och Markdownfilerna och deras originalkällor. Ursprungliga rapporter före rättningar bevaras som revisionsspår; läs dem tillsammans med rättningsrapporten.

## Köra och bygga

Node.js 24 eller senare:

```sh
npm ci
npm run check
npm test
npm run build
npm run preview
```

Öppna `http://localhost:4173/fffs-bibliotek/` efter `preview`. `dev` kör Vite för listans UI; `build` och `preview` inkluderar alla förgenererade lässidor.

GitHub Actions bygger och publicerar `dist/` på GitHub Pages när `main` uppdateras. Reponamnet ingår i `vite.config.ts`, `src/views.ts` och `src/config.ts`; ändra dessa vid flytt. Sidorna är läsbara utan JavaScript. Filtrering och sökning körs i webbläsaren, utan analyskakor eller en extern söktjänst.

## MCP

Serverkoden finns i `lib/worker.ts`, med MCP-protokollet från det officiella TypeScript-SDK:t. Den körs publikt på Vercel Node.js 24, separat från GitHub Pages som endast serverar statiska filer. `server/` innehåller Vercel-adaptern. Kör `npm run build:vercel` efter ändringar i `lib/` och inkludera den genererade `server/worker.mjs` i committen. Projektets Root Directory är `server`.

Worker-formatet kan också byggas med `npm run build:mcp` till `dist/server/index.js`. Den valfria Sites-anslutningen kräver OAuth hos värden; den öppna adressen ovan behöver ingen inloggning.

Miljövariabler för servern (dessa värden används som standard i Vercel-adaptern):

```text
DATA_BASE_URL=https://nic-esp.github.io/fffs-bibliotek/
ALLOWED_ORIGINS=*
```

Wildcard-CORS är ett uttryckligt val för denna publika server utan sessionskakor. Utan det används en strikt ursprungslista. Datakällan är låst till HTTPS på GitHub Pages; klienter kan inte välja godtyckliga hämtningsadresser.

Verktyg: `search_fffs`, `list_fffs`, `get_fffs`, `get_section`, `get_amendments`, `get_library_status`. Resurser: `fffs://catalog` och `fffs://{id}`. Dokument-ID använder `YYYY-NN`. Standardfiltret är `current`; välj `status=all` för hela samlingen. Fortsätt med `nextCursor` tills den är `null` för långa dokument. Responsen innehåller källor, datum och metadata.

```sh
npx tsx scripts/smoke-mcp.ts https://fffs-public-mcp.vercel.app/mcp
```

## Uppdatera samlingen

Ingen schemalagd uppdatering är aktiverad. Nytt material behöver jämföras med FI:s register, original- och ändringsförfattningar, ikraftträdanden och övergångsbestämmelser innan utgåvans datum ändras. Automatisk textutvinning räcker inte för att intyga juridisk konsolidering.

De godkända, genererade filerna finns i `public/data`, `public/documents`, `public/images` och `public/pdf`. Uppdatera katalog och dokumentmetadata tillsammans. Vid ändrad text ska Markdown, avsnittsankare, fulltextsökindex och EU-belägg regenereras från samma underlag. Kontrollera berörda tabeller och formler visuellt mot PDF.

`scripts/import-library.mjs` kan återimportera den granskade lokala leveransstrukturen (med `_granskning_2026-10-09/webdata`, EU-kartläggning och käll-PDF:er). Den kontrollerar PDF-hashar, lägger till EU-metadata och kopierar enbart utvalda offentliga artefakter. Det lokala arbetsmaterialet och verktygens virtuella miljöer publiceras inte.

## Rättigheter

Egenutvecklad programkod i detta repo är MIT-licensierad, se `LICENSE`. Den licensen omfattar inte FI:s eller EU:s källdokument, logotyper eller andra tredjeparters material. Dokumenten återges med källhänvisningar. Beroenden har sina respektive licenser.
