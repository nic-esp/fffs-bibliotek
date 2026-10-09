# EU-kopplingar till FFFS – underlag 2026-10-09

`eu-relations.json` innehåller en nyckel för var och en av katalogens **130 grundförfattningar**. **46** har minst en kartlagd koppling: totalt **326** poster till **93** olika EU-rättsakter. **84** har tom array, vilket betyder **ingen EU-koppling kartlagd i denna genomgång**. Det är inte en uppgift om att EU-koppling saknas.

| Klassning | Antal | Betydelse |
|---|---:|---|
| `implements` | 23 | FI:s föreskriftstext eller sammanfattning anger uttryckligt genomförande, delvis genomförande eller bidrag till genomförande av direktivet. |
| `supplements` | 11 | Tillämpningsbestämmelsen eller FI anger nationella bestämmelser som kompletterar EU-förordningen. DORA-klassningen bygger på rapporteringsbestämmelserna och det uttryckliga bemyndigandet i förordningen med kompletterande bestämmelser. |
| `references` | 292 | Rättsakten nämns i texten. Detta omfattar också rättsakter som förekommer inne i en annan EU-rättsakts fullständiga titel. Ingen genomföranderelation påstås. |

## Källor och metod

Katalog och samtliga 130 dokumenttexter lästes från `webdata/data`. Varje automatisk koppling innehåller det uttryckliga numret och ett omgivande textutdrag, FI:s källsida, källfil samt befintligt `sectionId`. Numren normaliseras till CELEX; exempelvis förordning (EU) nr 575/2013 blir `32013R0575`. Svenska kortidentifieringar används i `title`, och etablerade namn, exempelvis CRR, i `label`.

34 klassningar har granskats separat mot författningarnas tillämpningsparagrafer eller FI:s sammanfattningar. De återfinns i `eu-evidence-overrides.json` med `relationBasis` och ersätter den automatiska referensklassningen. 34 FI-sidor finns sparade i `eu-fi-summaries.json`. Granskade utdrag kontrolleras vid ombyggnad mot de sparade källorna; ankare från annan text återanvänds inte när belägget kommer från FI:s sammanfattning.

Följande prioriterade samband ingår bland annat:

- FFFS 2014:12 kompletterar CRR och IFR och genomför delvis CRD och IFD enligt 1 kap. 1 §.
- FFFS 2024:20 innehåller svenska rapporteringsbestämmelser enligt DORA.
- FFFS 2015:8 genomför delar av Solvens II; 2015:8, 2015:13 och 2015:21 kompletterar angivna delegerade/genomförandeförordningar.
- FFFS 2017:22 genomför delar av MiFID II. FFFS 2017:2 har separat belagda genomförandekopplingar till IFD och MiFID II:s delegerade direktiv samt dess hållbarhetsändring.
- FFFS 2017:11 bidrar till genomförandet av ändringar i fjärde penningtvättsdirektivet.
- FFFS 2013:9 genomför delar av UCITS och 2013:10 delar av AIFMD.
- FFFS 2018:4, 2010:3 och 2011:49 har belagda genomförandekopplingar till PSD2.
- FFFS 2019:21 och 2019:19 har belagda genomförandekopplingar till IORP II.
- FFFS 2018:10, 2016:29 och 2016:6 har kopplingar till IDD, bolånedirektivet respektive BRRD.

## EUR-Lex

Länkarna använder det officiella CELEX-formatet `https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:…` och går till den identifierade rättsaktens dokumentpost, inte till en godtyckligt vald konsolideringsdag. EUR-Lex erbjuder aktuella och historiska konsolideringar från posten.

Identiteter och grundlänkar för kärnreglerna kontrollerades mot EUR-Lex: [CRD](https://eur-lex.europa.eu/eli/dir/2013/36/oj), [CRR](https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32013R0575), [DORA](https://eur-lex.europa.eu/eli/reg/2022/2554/oj/swe), [Solvens II](https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32009L0138), [MiFID II](https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32014L0065), [fjärde penningtvättsdirektivet](https://eur-lex.europa.eu/legal-content/SV/ALL/?uri=celex:32015L0849), [UCITS](https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32009L0065), [AIFMD](https://eur-lex.europa.eu/legal-content/en/HIS/?uri=CELEX:32011L0061), [PSD2](https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32015L2366) och [IORP II](https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:32016L2341). Vissa direktanrop mötte EUR-Lex JavaScript-kontroll eller storleksgräns; där användes EUR-Lex egen indexerade dokumentinformation för identifieringen. Samtliga 93 unika länkmål har **inte** hämtats och kontrollerats individuellt.

## Avgränsningar och källavvikelser

- Kartläggningen är ett navigerings- och beläggsunderlag, inte ett intyg om fullständig svensk implementering eller varje EU-rättsakts aktuella tillämplighet. Genomförandet delas ofta mellan lag, förordning och flera myndighetsföreskrifter.
- Historiska hänvisningar finns kvar när de står i underlaget. Exempelvis är den ursprungliga PSD-kopplingen i FFFS 2010:3 märkt historisk i `relationBasis`. Länken säger inte att den äldre EU-rättsakten alltjämt är gällande.
- Hänvisningar inne i en annan rättsakts titel kan ge flera länkar per paragraf; alla sådana poster har försiktigt klassats `references`.
- Ingen allmän kontroll av EU-rättsakternas ändringskedjor, upphävanden eller nationella införlivanderegister har genomförts. Ingen automatisk koppling har gjorts enbart utifrån bransch eller ämneslikhet.
- FFFS 2013:9, `section-0018`, återger DORA-titeln med numret `(EU) 2016/101`. Denna match utesluts eftersom DORA:s titel avser **2016/1011**. Underlaget skapar alltså ingen felaktig länk till förordning 2016/101. Källtexten har inte ändrats inom denna metadatauppgift.
- FI:s sammanfattning för FFFS 2017:2 har i ett senare ändringsstycke numret `2019/2033/EU` efter ordet värdepappersbolagsdirektivet. Ingen länk till ett sådant direktiv har skapats. IFD-kopplingen stöds av ett annat stycke på samma sida som korrekt anger `2019/2034/EU`.
- Alla 130 texter har genomsökts, men alla FI-sammanfattningar och beslutspromemorior har inte närlästs. Fler kopplingar kan därför finnas, även för dokument med tom array.
- EU-posternas ankare identifierar beläggstext. De innebär inte en paragrafvis mappning mellan svensk rätt och EU-rätt.

## Återkörning och kontroll

Från samlingens rot:

```sh
python3 _granskning_2026-10-09/build_eu_overrides.py
python3 _granskning_2026-10-09/build_eu_relations.py
python3 _granskning_2026-10-09/validate_eu_relations.py
```

`fetch_eu_fi_summaries.py` kan hämta FI-sidorna på nytt. Ändrade sammanfattningar kan göra att den avsiktligt strikta citatkontrollen stoppar byggningen; granska då belägget innan formuleringen uppdateras.

`eu-relations-validation.json` bekräftar alla 130 nycklar, unika rättsakter per FFFS, CELEX- och URL-format, obligatoriska belägg, giltiga ankare och separat underlag för genomförande/komplettering. `eu-relations-summary.json` ger maskinläsbar täckning och listan över dokument utan kartlagd koppling.

Originaldokument och site-checkout har inte ändrats inom denna metadatauppgift.

## Slutlig förankring efter rubrikrättning

EU-underlaget byggdes om efter dataagentens sista rubrik-/ankarrättning i de 130 dokumenten. Samtliga kopplingar med `sectionId` har därefter kontrollerats både mot den slutliga rubriken och mot själva beläggstexten under ankaret. De granskade tillämpningsparagraferna har dessutom uttrycklig titelkontroll i byggskriptet. Antal och klassningar är oförändrade. Slutlig filhash framgår av `eu-relations-validation.json`.
