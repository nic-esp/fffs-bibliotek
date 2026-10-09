# Oberoende granskning av egenkonsolideringar

Datum: 2026-10-09. Originalfilerna ändrades inte under granskningen.

> **Rättningsstatus:** De konstaterade felen nedan har nu åtgärdats i de aktuella leveransfilerna. Se [rättningsrapporten](rattning_egenkonsolideringar.md). Denna granskning beskriver de bevarade ursprungsversionerna.

## Slutsats och avgränsning

Påståendet att alla egenkonsolideringar är fullständiga stöds inte av leveransen. Två granskade bilagor har en beräkningsformel som antingen saknas helt eller inte går att läsa. Därutöver har blankettstrukturen gått förlorad i de stora rapporteringsförfattningarna och ett mindre textbortfall finns i FFFS 2016:1.

Detta är en riktad innehållsgranskning, inte ett fullständigt godkännande av alla 15 dokument. Samtliga 15 Markdownfiler har omfattats av textinventering och sökning efter uttryckliga luckor och extraktionsfel. Fördjupad granskning har gjorts av FFFS 2016:1, 2015:13 och 2019:22. Källor och kvalitetskontroller för ytterligare dokument har lästs. Visuell jämförelse har gjorts av relevanta käll-PDF-sidor och levererade PDF-sidor för de två största dokumentens konstaterade fel. Sidnummer nedan är PDF-sidor räknade från första sidan.

## Verifierade fel

### 1. FFFS 2015:13: integralformeln i bilaga 3 J79 saknas helt

- Leverans: `Egenkonsoliderade/FFFS 2015-13_egenkonsoliderad.md`, rad 3266–3272; motsvarande PDF sida 45.
- Källan är FFFS 2019:26, bilaga 3, J79, sida 23. Där finns en integral från t1 till t2 av a(x,t) · V(t) dt.
- Leveransen går direkt från meningen som introducerar integralen till variabelförklaringen "där x = insjuknandeålder". Själva formeln saknas både i Markdown och renderad PDF.
- Detta är ett informationsbortfall, inte enbart en annorlunda layout. KIMI:s egen kvalitetskontroll beskriver bilaga 3 som ersatt och kontrollerad men uppmärksammar inte den saknade formeln.
- Visuell evidens: `bilder/2019-26-s23.png` (källa) och `bilder/2015-13-egen-s45.png` (leverans).

### 2. FFFS 2019:22: integralformeln i bilaga 2 E55 är oläslig

- Leverans: `Egenkonsoliderade/FFFS 2019-22_egenkonsoliderad.md`, rad 4203–4205; motsvarande PDF sida 57.
- Källan är FFFS 2025:1, bilaga 2, E55, sida 56. Den tryckta källan har en läsbar integral från t1 till t2 av a(x,t) · V(t) dt.
- Markdown innehåller ett ersättningstecken, dubblerade matematiska bokstäver och integreringsgränser efter uttrycket. I levererad PDF visas i stället huvudsakligen svarta rutor.
- Käll-PDF:ens extraherade text är också korrupt på denna punkt. Felet har alltså kopierats från textutdraget och därefter förvärrats vid rendering. Visuell källkontroll behövs; textmatchning mot samma extraktion skulle inte upptäcka felet.
- Visuell evidens: `bilder/2025-1-s56.png` (källa) och `bilder/2019-22-egen-s57.png` (leverans).

### 3. FFFS 2016:1: bemyndigandets punktnummer har fallit bort

- Leverans: `Egenkonsoliderade/FFFS 2016-01_egenkonsoliderad.md`, rad 27: hänvisningen är "5 kap. 2 § förordningen (2004:329)".
- Grundförfattningens sida 1 har "5 kap. 2 § 11 förordningen (2004:329)". Punktnumret 11 saknas i leveransen.
- FFFS 2026:17 ändrar 3 §; den föreskriver ingen sådan ändring av grundförfattningens ingress. KIMI:s kvalitetskontroll säger uttryckligen att ingressens ursprungliga stöd 5 kap. 2 § 11 har behållits, vilket inte stämmer med den slutliga filen.
- Felet ligger i ingressen, inte i själva anmälningsregeln. 1–2 §§ samt den nya 3 § har i denna kontroll befunnits stämma med källtexterna efter normalisering av uppenbara PDF-avstavningar. Den nya 3 § är rätt angiven som gällande från 2026-07-01.

### 4. FFFS 2019:22: blankettens samband mellan kolumner och rader har förstörts

- Exempel: bilaga 1, avsnitt A. FFFS 2025:1 sida 4 har en tabell för raderna A28–A34 med kolumnerna Totalt, Förmånsbestämd traditionell försäkring och Avgiftsbestämd traditionell försäkring. "Varav" är en överordnad rubrik till de två sista kolumnerna.
- Leveransens PDF sida 9 återger rubriker och poster som löpande separata rader utan tabell. "varav:" har hamnat direkt efter A27 Periodens resultat och ser därför ut att höra till A27. Kopplingen mellan A28–A34 och deras rapporteringskolumner framgår inte längre entydigt.
- Förlusten av rutnät och hierarki är verifierad. Att detta kan leda till felaktig rapportering är en riskbedömning, inte ett observerat användarfel.
- KIMI upplyser om att blanketterna har plattats ut i leveransens anmärkning på Markdownrad 366 och i kvalitetskontrollen. Upplysningen gör begränsningen spårbar men återställer inte den saknade strukturen. FFFS 2015:13 har samma dokumenterade metod och anmärkning på rad 276; någon fullständig tabell-för-tabell-kontroll av det dokumentet har inte utförts här.
- Visuell evidens: `bilder/2025-1-s4.png` (källa) och `bilder/2019-22-egen-s9.png` (leverans).

### 5. FFFS 2015:13: motstridiga ikraftträdandedatum för FFFS 2019:26

- Dokumenthuvudet på Markdownrad 12 anger att FFFS 2019:26 är i kraft 2019-12-10. KIMI:s kvalitetskontroll upprepar samma datum.
- Officiella ändringsförfattningen FFFS 2019:26 sida 1 säger i stället 2020-01-01. Den 10 december 2019 är beslutsdagen.
- Den egna konsolideringens övergångsavsnitt på rad 255 har det korrekta datumet 2020-01-01. Dokumentet motsäger alltså sig självt.
- FI:s ändringssida har också motstridig metadata: sidhuvudet anger 2019-12-10 men sammanfattningen och den bindande PDF-texten anger 2020-01-01. KIMI verkar ha fört vidare webbmetadata till dokumenthuvudet utan att kontrollera mot PDF:ens ikraftträdandebestämmelse.
- Båda datumen ligger före granskningsdagen, så felet ändrar inte den aktuella lydelsen per 2026-10-09. Det är ändå ett verifierat fel i versionsinformationen.

## Överlappande fynd i FFFS 2014:12

Leveransens Markdownrad 271 ersätter själva formeln för systemriskbuffert i 9 kap. 5 § med en hänvisning till original-PDF. Detta är ett explicit innehållsbortfall. Huvudgranskningen verifierar detta separat. Fyndet räknas därför inte dubbelt här.

## Kontroller med positivt resultat

- FFFS 2016:1: paragraftexten 1–3 §§ och ikraftträdandet för 2026:17 stämmer i den riktade jämförelsen; endast ingressens punktnummer avviker enligt ovan.
- FFFS 2023:13: FFFS 2026:21:s ikraftträdandebestämmelse säger 2027-01-11 för 2 § och 2026-07-01 för övriga ändringar. Leveransen anger korrekt att den framtida 2 § inte har förts in. Påståendet i överlämningen att framtida ändringar redan införts är därför missvisande för just detta exempel; dokumentets versionshantering är här bättre än överlämningens formulering.
- FFFS 2015:13 och 2019:22 innehåller båda bilagerubrikerna 1–9. Närvaro av en rubrik är dock inte bevis för att alla bilder, tabellsamband och formler är bevarade; fynden ovan visar varför.

## Ej verifierade risker och kvarstående kontroll

- Samtliga övriga ändringsbeslut och oförändrade textavsnitt har inte jämförts tecken för tecken i denna delgranskning. De ska inte anses godkända bara för att inga ytterligare fel listas här.
- Det generella städskriptet `../_arbete/konsolidering/clean.py` tar bort alla fristående rader med 1–3 siffror såsom sidnummer. Det kan även ta bort betydelsebärande tal i tabeller eller formler. Inget separat konkret talbortfall har fastställts här.
- Samma skript fogar ihop ord utifrån en korpus. Detta kan påverka texten utöver rena radbrytningar; omfattningen har inte verifierats.
- Alla bilagor bör granskas visuellt eller bevaras som original-PDF-sidor. Den robustaste reparationen av oförändrade eller helt ersatta bilagor är att infoga rätt käll-PDF-sidor i det konsoliderade dokumentet och behålla en tydlig ändringsförteckning. För delvis ändrade bilagor behövs särskild versionskontroll.
- Efter reparation behövs ny jämförelse av de berörda sidorna. Att PDF-filen går att öppna och innehåller text räcker inte som kontroll av innehållsfullständighet.

## Källor och bevisfiler

- [FFFS 2015:13 – levererad PDF](<[local-source-collection]/Egenkonsoliderade/FFFS 2015-13_egenkonsoliderad.pdf>)
- [FFFS 2019:26 – källa till bilaga 3 J79](<[local-source-parent]/_arbete/konsolidering/2015-13/FFFS2019-26.pdf>)
- [FFFS 2019:22 – levererad PDF](<[local-source-collection]/Egenkonsoliderade/FFFS 2019-22_egenkonsoliderad.pdf>)
- [FFFS 2025:1 – källa till bilaga 2 E55 och bilaga 1](<[local-source-parent]/_arbete/konsolidering/2019-22/FFFS2025-1.pdf>)
- [FFFS 2016:1 – original](<[local-source-parent]/_arbete/konsolidering/2016-1/fs1601.pdf>)
- [FFFS 2026:17 – ändring av 3 §](<[local-source-parent]/_arbete/konsolidering/2016-1/fs2617_andring.pdf>)
- [KIMI:s kvalitetskontroll 2016:1](<[local-source-parent]/_arbete/konsolidering/2016-1/kvalitetskontroll.md>)
- [FFFS 2026:21 – ikraftträdande](<[local-source-parent]/_arbete/konsolidering/2023-13/fs2621_andring.pdf>)

Officiella register- och källlänkar:

- [FFFS 2016:1, original-PDF hos FI](https://www.fi.se/contentassets/0da051ee20674ef382a3a9a2ba0fd455/fs1601.pdf) – kontrollerad live.
- [FFFS 2019:26, officiell PDF hos FI](https://www.fi.se/contentassets/52231a40118e486d84630562929897a1/fs1926.pdf) – direktlänk och ikraftträdande verifierade live; formel granskad visuellt i den sparade officiella PDF-filen.
- [FFFS 2025:1, officiell PDF hos FI](https://www.fi.se/contentassets/f186eff010e84954929b27e42057161a/fs2501.pdf) – direktlänk verifierad live; formel och blankett granskade visuellt i den sparade officiella PDF-filen.
