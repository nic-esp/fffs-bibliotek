# Byggkontroll 2026-10-09

Samtliga 130 dokument är byggda: 115 FI-PDF:er och 15 egenkonsoliderade Markdown-filer. De senast riktat rättade egenversionerna är införda. PDF-källorna innehåller sammanlagt 1 604 sidor.

Kontroller: kontraktets metadatafält; unika id; identiska Markdown-texter i fil, dokument-JSON och bulkindex; unika rubrikankare; samtliga bildreferenser pekar på faktiska filer; inga privata absoluta sökvägar i publicerbara filer; samtliga institutions- och kategoritaggar har belägg; alla sectionsreferenser i beläggen kan lösas; scope-utdrag håller gränsen 1 500 tecken. Nio bilagelänkar vardera för 2015:13 och 2019:22 länkar till rätt publicerad PDF och sidnummer.

Kontrollexempel: 2014:4 visar tillämpningsområdets DORA-undantag och dess undantag för värdepappersbolag. 2017:11 har inget påhittat institutionurval: laghänvisningen är bevarad, institutionslistan är tom, och en notering förklarar varför.

Den kompletterande tokenjämförelsen är en grov bortfallskontroll, inte textvalidering. Av 115 FI-konverteringar hade 113 minst 90 procent matchande alfanumeriska token mot PyMuPDF:s raka PDF-textuttag. De två lägre resultaten, 1992:33 och 1992:34, kontrollerades: äldre kontaktuppgifter i sidfoten filtrerades bort; upphävandereglerna behölls. Ett konstaterat radbrytningsfel i en delad sammansättning korrigeras nu källbelagt av byggskriptet. Exakta citat ska fortsatt kontrolleras i PDF.

En lågtext-sida (2022:17, sida 3) består huvudsakligen av underskriftsnamn. Text och en sidbild finns i läsutgåvan med notering. 542 PNG-resurser, cirka 1,6 MB, genererades i FI-steget. PyMuPDF rapporterade en varning om saknad standardkonfiguration för PDF-lager vid den kompletterande råtextjämförelsen; samtliga filer kunde läsas och jämföras.

Senaste maskinläsbara kontrollsammanfattning: build-quality/final-validation.json. Detta är teknisk kontroll av statiska läs- och sökdata, inte ett fullständigt juridiskt eller visuellt kvalitetsintyg.
