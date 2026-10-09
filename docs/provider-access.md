# Screeningkällor: åtkomst och integrationsgränser

Kontrollerat **2026-10-09**. Den nuvarande leveransen använder källstatus och länkar till de officiella sökportalerna. Inga konton har skapats, inga avtal accepterats, inga API-nycklar hämtats och inga krediter förbrukats. Den förberedda adaptern aktiverar inte i sig någon publik HTTP-route eller något screeningverktyg i MCP.

## OpenSanctions

Den officiella [autentiseringsdokumentationen](https://www.opensanctions.org/docs/api/authentication/) kräver API-nyckel för den driftade tjänsten, med `Authorization: ApiKey …`. [Match-API:t](https://www.opensanctions.org/docs/api/matching/) används för kandidatsökning; vanlig textsökning har ett annat ändamål. [OpenAPI-specifikationen](https://api.opensanctions.org/openapi.json) gick att läsa utan nyckel. Läsbara specifikationer innebär inte att sökanrop är fria eller anonyma.

Adaptern använder ett fast `POST https://api.opensanctions.org/match/default?limit=10`. Varje anrop innehåller exakt en fråga med namn, entitetstyp och valfritt land/företagsnummer. `country` betyder här en allmän landsanknytning, inte en slutsats om medborgarskap eller registreringsland. Personen måste kunna skiljas från andra med samma namn med hjälp av ursprungskällorna innan en bedömning görs.

En CORS-preflight den 9 oktober från origin `https://nic-esp.github.io`, för `POST` och headers `authorization,content-type`, fick **HTTP 401 utan Access-Control-Allow-headers**. En direkt webbläsaranslutning är därför inte verifierat fungerande. Observationen säger inget om andra origins eller en framtida ändring hos leverantören. Inget autentiserat matchanrop gjordes.

Vid senare aktivering används en serveradapter med användarens egen nyckel. En möjlig separat applikationsroute är `POST /screening/opensanctions`, där nyckeln endast överförs i `X-OpenSanctions-Api-Key`. Den är inte implementerad eller aktiverad av denna adapter. Namn och företagsnummer ska inte läggas i URL:er, analysverktyg eller applikationsloggar. Proxy/hosting-loggar måste också kontrolleras innan en sådan route aktiveras.

### Resultat och källbevis

`/match` returnerar kandidater. `providerMatch` återger leverantörens tröskelflagga, medan `identityStatus` alltid är `unconfirmed`. `score` är ingen sannolikhet för att identiteten eller en överträdelse har bekräftats. Avsaknad av kandidater ger inte ett friskintyg. En misslyckad eller otillgänglig sökning returnerar aldrig ett tomt resultat som om sökningen genomförts.

En separat, uttrycklig `fetchOpenSanctionsEvidence` använder [GET /entities/{id}](https://www.opensanctions.org/docs/api/entities/), eftersom matchsvaret normalt saknar relationer. Bara kandidatens direkt underordnade `Sanction`-objekt mappas. En ägares eller närståendes sanktion kopieras inte över till kandidaten. Fälten skiljer på utfärdare, publiceringsdatum (`listingDate`), ikraftträdande (`startDate`), slutdatum, program och ursprungslänk enligt [datamodellen](https://www.opensanctions.org/reference/). `firstSeen`, `lastSeen` och `lastChange` är separat insamlingsmetadata, inte sanktionsdatum.

Saknade uppgifter fylls inte i. `evidenceStatus` skiljer mellan uppgifter som finns, ännu inte efterfrågats och inte returnerats. Högst 100 direkta sanktionsposter återges; `evidenceTruncated` anger om svaret innehöll fler. Adaptern genomför ingen automatisk paginering eller ny hämtning. Ursprungskällan och leverantörens fullständiga profil måste fortsatt kunna öppnas. Äldre sammanslagna entitets-ID:n kan kräva en ny sökning: leverantörens dokumenterade 308-omdirigering följs inte automatiskt av denna adapter.

### Kostnad, licens och befintlig MCP

Enligt [API-FAQ](https://www.opensanctions.org/docs/api/faq/) förbrukar varje lyckad matchfråga en kredit; `/entities` anges för närvarande som gratis, men kräver fortfarande nyckel. Det här är inte ett godkännande att köpa eller förbruka krediter. Kontrollera aktuella villkor och konto innan aktivering.

[API-villkoren, giltiga från 15 september 2026](https://www.opensanctions.org/docs/terms/api/202609/), kräver registrering. Punkterna 7.2–7.4 tillåter användning inom egna produkter under avtalet, men begränsar vidareöverlåtelse, väsentlig återpublicering och konkurrerande användning. En offentlig generell API-proxy med en gemensam nyckel ska därför inte antas omfattas. En kundägd nyckel löser inte automatiskt alla avtalsfrågor.

OpenSanctions tillhandahåller redan [yente-client och MCP-servern yente-mcp](https://yenteclient.followthemoney.tech/mcp/). [Programvaran är MIT-licensierad](https://www.opensanctions.org/docs/opensource/); det ger inte automatiskt rätt att använda datamängden kommersiellt. [Datatjänstens kommersiella villkor](https://www.opensanctions.org/docs/commercial/faq/) är en separat fråga. Vi bygger därför ingen ersättare för matchningsmotorn eller datasetkopiering. Den lilla TypeScript-adaptern begränsar projektets integrationsyta och normaliserar källbevis.

## IOSCO I-SCAN

Den officiella [I-SCAN-portalen](https://www.iosco.org/i-scan/) fungerade i vanlig Chrome utan konto. Tabellen visar bland annat handelsnamn, företagsnamn, webbplats, tillsynsmyndighet och datum samt länkar till varningar. Vanliga automatiserade HTTP-förfrågningar gav 403; inga kontroller kringgicks och inga privata eller gissade endpoints användes.

Portalens synliga länk till [IOSCO I-SCAN API – Terms of Use Agreement](https://www.iosco.org/i-scan/IOSCO_I-SCAN_API_Terms_of_Use_Agreement.pdf) kunde hämtas via webbläsaren. Båda sidorna textlästes och kontrollerades visuellt. Den hämtade PDF:ens SHA-256 var `b4336dbaea088bc3ae61c37a833b9fdca853c25cb3c749ffa6f590c2eef2b5a0`.

- Sida 1, punkt 1: API:t är en lästjänst för varningsdata, även för icke-medlemmar.
- Sida 1, punkt 3: begränsad, icke exklusiv och icke överlåtbar läsrätt med bland annat attribution och oförvanskad återgivning.
- Sida 1, punkt 4: förbjuder kringgående av tekniska kontroller, otillåtna endpoints, reverse engineering och säkerhetstestning utan skriftligt samtycke.
- Sida 1, punkt 5: anger skyldigheter för API-credentials och att följa IOSCO:s dokumentation.
- Sida 2, punkt 12: användaren ska returnera ett undertecknat formulär till IOSCO; signatur, organisation, namn och datum efterfrågas.

Det är alltså ett verkligt API med ett avtalsförfarande. Vi har **inte verifierat någon konto- och avtalsfri API-endpoint**, något autentiseringsschema, tekniska kvoter eller eventuell avgift. Avsaknad av pris i detta dokument är inte ett belägg för kostnadsfri åtkomst. `getIscanAvailability()` lämnar därför `status: 'unavailable'`, `code: 'api_access_not_verified'` och en fungerande portallänk. Det gör ingen sökning och lämnar inget påhittat resultat.

IOSCO anger i punkterna 2 och 9 att medlemsmyndigheter lämnar uppgifterna och att IOSCO inte självständigt verifierar allt. Portalens varning och den ursprungliga myndighetskällan behöver därför hållas åtskilda. En namnkandidat ska inte presenteras som fastställd identitet. Ingen publicerad varning får inte framställas som bevis för tillstånd eller frånvaro av risk.

## Exporterade funktioner

```ts
type ScreeningInput = {
  name: string;
  schema: 'Person' | 'Company' | 'Organization';
  country?: string;
  registrationNumber?: string;
};

getScreeningProviderStatus(): ScreeningProviderStatus[];
getIscanAvailability(): ScreeningProviderStatus;
screenOpenSanctions(input: ScreeningInput, apiKey: string,
  options?: ScreeningOptions): Promise<ScreeningResult>;
fetchOpenSanctionsEvidence(entityId: string, apiKey: string,
  options?: ScreeningOptions): Promise<ScreeningEvidenceResult>;
```

Fullständiga typer finns i `lib/screening.ts`. `ScreeningOptions` tillåter injicerad fetch, avbrottssignal och klocka. Nyckeln är ett separat funktionsargument i serverkod och får aldrig bli MCP-toolargument, chatttext, sparat ärendefält eller URL-parameter. Den offentliga MCP-integrationen använder enbart källstatus tills åtkomst och licens är klarlagda.

Adaptern har inget persistent tillstånd, ingen loggning och inga automatiska omförsök. Den accepterar inga godtyckliga mål-URL:er, omdirigerar inte, använder `no-store`, avbryter efter 15 sekunder och begränsar svar till 2 MiB. Feltexter från leverantören/transporten återges inte, eftersom de kan innehålla känsliga uppgifter. Ärendeexport eller sparande måste vara en separat uttrycklig användarhandling.

## Verifieringens omfattning

`tests/screening.test.ts` använder syntetiska svar och verifierar protokoll, begränsade fält, kandidaternas status, käll-/datumtolkning, felhantering, hemlighetsminimering och frånvaro av anrop när nyckel saknas. Testerna är inte ett lyckat live-screeningprov. Publik dokumentation, OpenAPI och CORS-preflight har kontrollerats; autentiserade API-anrop har inte utförts.
