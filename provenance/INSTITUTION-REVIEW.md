# Institutionsfilter och sektionsrättning – 2026-10-09

Katalogens 75 poster med status `current` är kandidater efter registergranskningen, inte en juridiskt certifierad totalpopulation. 72 har nu institutionstaggar (tidigare 36). Tre saknar säker tagg: FFFS 2017:22 (positionsgränser, inte en viss institutionstyp), FFFS 2007:24 (kapitalvärdesberäkning genom laghänvisning), FFFS 1991:1 (fortsatt giltighet av äldre föreskrifter). Tre har bara en bred tagg för FI-tillsyn: FFFS 2024:22, 2002:23 och 1998:22. En specifikt filtrerad lista är inte uttömmande. Dessa luckor redovisas även i `catalog.institutionIndex`.

Taggarna är sökhjälp. En träff betyder att den angivna delen av institutionstypen omfattas av någon angiven bestämmelse, med dess verksamhetsvillkor och undantag. Det är inte ett besked att varje företag i gruppen omfattas av hela dokumentet.

## Källbelagda kompletteringar

- 39 tidigare otaggade current-posters inledningar och tillämpningsområden har lästs. 36 fick underbyggda taggar; de tre ovan lämnades öppna.
- FFFS 2017:11: laghänvisningen till 1 kap. 2 § punkterna 1–13 i [SFS 2017:630](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2017630-om-atgarder-mot-penningtvatt-och_sfs-2017-630/) expanderades till sökgrupper med individuellt belägg. Använd lydelsen som gäller den 9 oktober, inte den framtida lydelsen från 20 november 2026. Livförsäkringsundantagen och den snävare uppräkningen för utländska filialer kvarstår.
- FFFS 2024:20: partiell expansion av [DORA artikel 2](https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32022R2554), med oförändrat krav på FI-tillsyn och förbehåll för artikel 2.3–2.4. Listan är medvetet inte en uttömmande upplösning av hänvisningen.
- Kreditinstitut används som överordnad grupp där bankaktiebolag, sparbanker, medlemsbanker eller kreditmarknadsföretag uttryckligen omfattas, med stöd i [1 kap. 5 § lagen (2004:297)](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2004297-om-bank-och-finansieringsrorelse_sfs-2004-297/). Värdepappersinstitut grupperas med stöd av definitionen i [lagen (2007:528)](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2007528-om-vardepappersmarknaden_sfs-2007-528/). Fondförvaltare är en uttryckligen redaktionell samlingsgrupp. Ingen gruppkoppling utvidgar tillämpningsområdet.
- FFFS 2014:4: tillämplighetsutdrag och notering bevarar undantaget för hantering av IKT-risker enligt DORA och den avgränsade personkretsen för värdepappersbolag.
- FFFS 2024:22: uttryckligen undantagna institutioner har inte taggats som omfattade.

## Teknisk kontroll

Alla 130 body-JSON är identiska med motsvarande poster i `data/search.json`; deras Markdown är identisk med separata `.md`-filer. Alla metadatareferenser till sektioner existerar. Inga privata absoluta sökvägar eller root-relativa PDF-/bildlänkar finns kvar. Samtliga publicerade bildlänkar pekar på befintliga lokala publiceringsfiler. Metadata `pdfUrl` och `markdownUrl` förblir relativa enligt kontraktet.

Fem falska kapitelrubriker i FFFS 2010:3 och en i FFFS 2015:13 demoterades till löptext. Referensen `1 kap. 2 § … lagen` ska inte byta aktivt kapitel. Regressionen är kontrollerad: FFFS 2010:3 återger nu `2 kap. 7 §`, samt korrekt kapitelkontext efter motsvarande referenser i 4 och 8 kap. Sektioner/ankare efter rättningarna fick nya nummer. Innehållet i samtliga 130 dokument jämfördes före/efter med endast rubrikmarkörer, ankare, sidmarkörer, blanksteg och URL-prefix normaliserade: inga ord eller sakuppgifter ändrades. Fulltext och tabeller har inte genomgått ny juridisk eller visuell granskning.

FFFS 2015:13:s ändring FFFS 2019:26 har ikraftträdandet 2020-01-01 i metadata, rättat från inventeringens 2019-12-10 enligt ändringsaktens övergångsbestämmelse som granskats av konsolideringsgranskaren.

## Reproduktion

Kör `scripts/build_library.py --group catalog` med webbdatamappens isolerade Python för enbart metadata. Kompletteringsreglerna finns i `scripts/institution_metadata.py`. Kör `--group catalog --repair-cached` för ordbevarande rubrik-/länkrättning av cache. Full ombyggnad använder `--group all`; samma rubrikdetektion och länknormalisering ingår där.
