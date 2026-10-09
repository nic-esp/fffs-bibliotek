# Oberoende granskning av FI:s konsoliderade versioner

Granskningsdatum: 2026-10-09. Originalfilerna har inte ändrats.

## Slutsats

KIMI:s bedömning att sex av FI:s konsolideringar saknar redan ikraftträdda ändringar är väl underbyggd och har oberoende bekräftats med aktuella hämtningar från FI. Samtliga sex filer är fortfarande de konsoliderade versioner som respektive FI-detaljsida länkar till. De hämtade filerna är byte-identiska med kopiorna i `_arbete/inaktuella_FI/`.

Alla 35 FI-PDF:er i leveransmappen är också byte-identiska med PDF:erna som nu hämtades från inventeringens FI-adresser. Detta verifierar filernas autenticitet och att de inte förändrats vid hämtning eller lagring. Det verifierar inte att varje ändringsföreskrift faktiskt införts korrekt i varje paragraf.

Påståendet i `INDEX.md` att alla 35 versioner har textkontrollerats mot samtliga ändringar är starkare än den sparade verifieringen stödjer. Av 41 poster i `verifiering_konsoliderade.json` har 26 endast bevis från försättsbladet. Övriga 15 har kompletterande kontroller, huvudsakligen av flaggade avvikelser.

## Sex inaktuella FI-versioner: bekräftat

Samtliga nedanstående ändringsföreskrifter träder i kraft 2026-07-01. Datum och relevant ändring har kontrollerats i respektive ändrings-PDF, hämtad på nytt från FI. Tabellen redovisar representativa bevis för varje saknad ändring; den utgör inte ett fullständigt godkännande av KIMI:s egenkonsolideringar.

| Grundförfattning | Saknad ändring | Oberoende kontroll i FI:s konsolidering | Källa |
|---|---|---|---|
| FFFS 2010:3 | 2026:12 | 9 kap. 1 §, PDF-sida 15, har äldre lydelse och hänvisning till 3 kap. FFFS 2014:12. Det nya kravet att tillämpa alternativ (a) enligt artikel 89.3 saknas. | [FI:s sida](https://www.fi.se/sv/vara-register/fffs/sok-fffs/2010/20103/), [ändring](https://www.fi.se/contentassets/49dc2952a0fc48b3824547a20cec4cbd/fs2612.pdf) |
| FFFS 2010:7 | 2026:13 | 2 kap. 4 §, PDF-sida 3, anger fortfarande årlig styrelsegranskning; ändringen föreskriver minst vartannat år. | [FI:s sida](https://www.fi.se/sv/vara-register/fffs/sok-fffs/2010/20107/), [ändring](https://www.fi.se/contentassets/a4c5e788441e491c903b8c5becdb0b6f/fs2613.pdf) |
| FFFS 2011:1 | 2026:14 | 2 kap., PDF-sida 3, går direkt från 2 a § till 3 §. Den nya 2 b § om intressekonflikter saknas. | [FI:s sida](https://www.fi.se/sv/vara-register/fffs/sok-fffs/2011/20111/), [ändring](https://www.fi.se/contentassets/0d73ff9ade66404cb60a137877ecf920/fs2614.pdf) |
| FFFS 2014:1 | 2026:15 | 2 kap. 12 § har äldre lydelse om styrelseutbildning. Den nya 3 kap. 2 a § om kryptotillgångar saknas; ordet kryptotillgångar finns inte i FI-texten. | [FI:s sida](https://www.fi.se/sv/vara-register/fffs/sok-fffs/2014/20141/), [ändring](https://www.fi.se/contentassets/a2f079ecfb36429b992fa6aaf6bebf13/fs2615.pdf) |
| FFFS 2014:12 | 2026:16 | 1 kap. 6 §, PDF-sida 2, listar elva kapitel. Ändringen utvidgar till tretton kapitel, inklusive nya 12 och 13 kap., som saknas. | [FI:s sida](https://www.fi.se/sv/vara-register/fffs/sok-fffs/2014/201412/), [ändring](https://www.fi.se/contentassets/aaf7f1edb2a64aa5a8e1c3168fe95a66/fs2616.pdf) |
| FFFS 2024:5 | 2026:22 | Nya 3 a-3 d kap. saknas, och 2 kap. 2 § punkt 3 har den äldre hänvisningen till FFFS 2014:1. | [FI:s sida](https://www.fi.se/sv/vara-register/fffs/sok-fffs/2024/20245/), [ändring](https://www.fi.se/contentassets/1b8449af119340aab22d5b28d59a1d6c/fs2622.pdf) |

## Verifieringsmetoden överdriver kontrollen

`../_arbete/verifiera_konsoliderade.py` läser två första PDF-sidorna (rad 24-30), extraherar högst 600 tecken från ändringslistan (rad 43-49), och klassificerar som uppdaterad när förfallna ändringsnummer finns där (rad 93-100). Den kontrollerar inte de ändrade paragrafernas lydelse, upphävanden, bilagor, formler eller övergångsbestämmelser. Filnamnsbedömningen i `uppdatera_bedomning.py` är ännu svagare och beskrivs där korrekt som indikativ.

Det finns dessutom ett konkret parserfel: regex på rad 49 kräver att varje nummer föregås av `FFFS`. FI utelämnar ibland det upprepade prefixet i en lista. Följande nummer är faktiskt synliga på försättsbladet men påstås i granskningsunderlaget saknas:

- FFFS 2013:9: listan slutar med `FFFS 2026:26, 2026:28`.
- FFFS 2013:10: listan innehåller `FFFS 2022:11; 2022:15` och slutar med `FFFS 2026:27, 2026:29`.
- FFFS 2017:2: listan innehåller `FFFS 2026:7, 2026:18, FFFS 2026:30`.
- FFFS 2015:8: listan innehåller `FFFS 2016:3, 2016:28`.
- FFFS 2007:17: bland annat 2016:23, 2017:5 och 2018:19 listas utan upprepat prefix.

För FFFS 2013:9 är formuleringen att FI ”hann inte lista” 2026:28 (`komplettering/2013-9/bedomning.md`, rad 16) alltså fel. Försättsbladet har även granskats visuellt. Felet ligger i extraktionen. Alla flaggor är dock inte sådana falsklarm: exempelvis saknas 2017:16 faktiskt i 2016:29:s försättslista.

Konsekvensen är främst missvisande granskningsdokumentation och ett otillräckligt underlag för kvalitetsförsäkran, inte i sig bevis för att de 35 FI-dokumenten har felaktig saktext.

## Framtida lydelser i FFFS 2013:9 och 2013:10

KIMI:s bedömningsfiler säger att 2026:26 respektive 2026:27 ”ska ... inte vara införd” och kopplar detta till att ingen åtgärd behövs. FI:s PDF:er innehåller faktiskt dessa framtida lydelser i brödtexten, tydligt märkta med att de träder i kraft 2027-04-16. Äldre och nya lydelser finns sida vid sida.

Exempel:

- FFFS 2013:10, 1 kap. 7 § (PDF-sida 2), har både gällande version med upphörandedatum 2027-04-16 och framtida version med ikraftträdandedatum samma dag. Detta har även verifierats visuellt.
- FFFS 2013:10, 16 kap. 7 a-7 d och 9 a §§, är märkta som framtida.
- FFFS 2013:9, bland annat 33 kap. 15-19 §§, är märkta med framtida ikraftträdande. I 1 kap. finns dubbla daterade lydelser.

Ikraftträdandedatumen verifierades även på de aktuella [FI-sidan för 2013:9](https://www.fi.se/sv/vara-register/fffs/sok-fffs/2013/20139/) och [FI-sidan för 2013:10](https://www.fi.se/sv/vara-register/fffs/sok-fffs/2013/201310/), samt i ändringsförfattningarnas PDF:er.

Detta är inte ett belagt fel i FI:s konsolideringar. Deras datumangivelser gör det möjligt att skilja gällande lydelse från framtida lydelse. Dokumentationen bör däremot förklara att mappen innehåller officiella konsolideringar med daterade framtida lydelser, inte uteslutande renodlad gällande text per 2026-10-09. En automatisk textsökning utan förståelse för datummarkörerna kan ge fel tillämplig lydelse.

## Separat innehållsbrist i egenkonsolideringen 2014:12

`Egenkonsoliderade/FFFS 2014-12_egenkonsoliderad.md`, rad 271, ersätter formeln i 9 kap. 5 § med en notering som hänvisar till original-PDF:en. Detta medges också i KIMI:s bedömningsfil. En leverans som saknar den föreskrivna formeln är inte en fullständig konsoliderad text, även om ändring 2026:16 lagts in korrekt. Detta behöver hanteras i den separata granskningen av egenkonsolideringarna.

## Spårbarhet och begränsningar

Granskningsunderlag finns i `fi_underlag/`:

- `live_verifiering.json`: SHA-256 och bytejämförelse för de sex inaktuella FI-versionerna samt 2013:9 och 2013:10.
- `live_detaljsidor.json` och åtta HTML-kopior: kontroll att aktuella FI-sidor fortfarande länkar samma åtta konsolideringar.
- `live_35_fi_pdfs.json`: bytejämförelse och SHA-256 för samtliga 35 levererade FI-PDF:er mot inventeringens officiella URL:er; 35 av 35 identiska. Senaste ändringsnummer förekommer också i respektive fulltext, men detta är endast en rimlighetskontroll.
- Åtta nedladdade konsolideringar, åtta relevanta ändringsförfattningar och deras textextraktioner.
- `2013-09-cover.png` och `2013-10-p2.png`: visuellt kontrollerade representativa sidor.

Hög säkerhet: de sex konkreta saknade ändringarna, byteidentiteten, parserfelet och de daterade framtida lydelserna.

Ej fastställt genom denna delgranskning: fullständig materiell korrekthet för varje paragraf och bilaga i samtliga 35 FI-konsolideringar eller i de 15 egenkonsolideringarna. Ett sådant godkännande kräver en ändringsmatris per bestämmelse med rätt lydelse och giltighetsintervall samt kontroll av bilagor och bildinnehåll.
