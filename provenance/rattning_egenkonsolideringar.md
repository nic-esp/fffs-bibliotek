# Genomförd rättning av egenkonsolideringar

Datum: 2026-10-09. Detta dokument redovisar rättningarna efter den oberoende granskningen. Det tidigare granskningsdokumentet beskriver ursprungsversionernas brister.

## Genomförda rättningar

| Författning | Rättning | Slutlig PDF |
|---|---|---:|
| FFFS 2014:12 | Formeln för systemriskbuffert i 9 kap. 5 § återställd: B_SR = r_T E_T + summan över i av r_i E_i. Läsbar formel i PDF; LaTeX i Markdown. | 13 sidor |
| FFFS 2015:13 | Integralformeln i bilaga 3 J79 återställd. Ikraftträdandet för 2019:26 rättat till 2020-01-01 i dokumenthuvudet. Alla nio bilagor har ersatts med aktuella FI-källsidor, med de delvis ändrade avsnitten I i bilaga 3 och 5 införda ur 2023:24. | 119 sidor |
| FFFS 2019:22 | Integralformeln i bilaga 2 E55 återställd. Alla nio bilagor har ersatts med aktuella FI-källsidor, vilket återställer blanketternas rad-/kolumnsamband, formler och layout. | 191 sidor |
| FFFS 2016:1 | Punktnumret 11 återställt i ingressens hänvisning till 5 kap. 2 § 11 förordningen (2004:329). | 1 sida |

Alla fyra finns som korrigerad Markdown och PDF i `Egenkonsoliderade/`. De åtta äldre filerna finns oförändrade i `original_fore_rattning/`; SHA-256 före ändring finns i den mappens `sha256.json`.

## Bilagor och spårbarhet

`bilagemanifest.json` anger för varje bilaga rätt käll-PDF, källans SHA-256, källsidintervall och sidintervall i leveransen. Sidnumren är 1-baserade och inkluderar båda ändpunkterna. Varje bilaga har ett PDF-bokmärke; Markdown har länkar till rätt sida i den sammansatta PDF:en.

- 2015:13: bilagorna 1, 2, 4, 6 och 8 kommer från grundförfattningen. Bilaga 3 och 5 kommer från 2019:26, med avsnitt I ersatt av respektive sida 3 och 4 i 2023:24. Bilaga 7 kommer från 2023:24, bilaga 9 från 2019:26.
- 2019:22: bilagorna 1–6 kommer från 2025:1, bilaga 7 från grundförfattningen, bilaga 8 från 2021:31 och bilaga 9 från 2020:12.
- 2015:13:s delvis ändrade originalsidor har delats vid de berörda avsnittsrubrikerna. De oförändrade sidsegmenten har behållits utan omformulering, den äldre I-texten har tagits bort även ur PDF:ens textlager och det nya avsnittet har infogats från ändringsförfattningen. De fyra sidutdragen är märkta som egna sidutdrag.
- Källornas tryckta sidnummer behålls. För sidnavigering i den sammansatta filen används PDF:ens faktiska sidnummer och bokmärken.

## Verifiering

- Alla **108 hela källsidor** i 2015:13 och alla **182 hela källsidor** i 2019:22 har renderats och jämförts pixel för pixel med respektive källa: **290 av 290 identiska**. Kontroll omfattar även blanketternas radlinjer och formler.
- De fyra delvis bevarade källsidorna i 2015:13 har jämförts med källornas exakta text inom respektive sidsegment: 4 av 4 identiska efter normalisering av blanksteg. De har också granskats visuellt.
- Visuellt kontrollerat: systemriskbuffertformeln (2014:12 sida 7), integralformeln i 2015:13 (sida 55), integralformeln i 2019:22 (sida 63), blankettexempel A28–A34 i 2019:22 (sida 11) och 2016:1:s kompletta sida inklusive rättad ingress.
- Äldre avsnitt I i bilaga 3 och 5 förekommer inte längre i PDF:ens textlager.
- De 18 bilagelänkarna i Markdown har verifierade startsidor i den sammansatta PDF:en.
- `rattning_verifiering.json` innehåller maskinresultat, slutliga filhashar och sidantal. `bilder_rattning/` innehåller visuell evidens.

## Kvarstående begränsningar

Markdownbilagorna för 2015:13 och 2019:22 är fortfarande extraherade textversioner, avsedda för sökning och läsning. De har inte återuppbyggts till kompletta HTML-tabeller. Den begränsningen anges uttryckligen i dokumenten; PDF-versionen har de fullständiga blanketterna och aktuella originalbilagorna. En webbsida bör därför erbjuda PDF-visning för bilagor och rendera `$$...$$` med KaTeX eller likvärdigt stöd.

Rättningen omfattar de konstaterade bristerna och bilagornas bevarande i dessa fyra författningar. Den innebär inte en ny fullständig ord-för-ord-granskning eller ett rättsligt godkännande av alla 15 egenkonsolideringar. FI:s grund- och ändringsförfattningar är fortsatt rättskällorna.

## Reproducerbarhet

`rattning_bygg.py` bygger från de sparade ursprungsversionerna och de befintliga käll-PDF:erna. `rattning_kontroll.py` utför bevarandekontrollerna. De använder det bundlade Python-runtime-paketet, ReportLab/PyPDF och ett lokalt PyMuPDF-hjälpbibliotek. `_verktygsbibliotek/` och `bygg_rattning/` är lokala byggberoenden och ska inte publiceras i webbprojektet.
