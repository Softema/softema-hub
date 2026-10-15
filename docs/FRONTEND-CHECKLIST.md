# Frontend checklist (prototyp nad lokálními daty)

Pracovní přehled požadavků z [ZADANI-APLIKACE.md](ZADANI-APLIKACE.md) a zadání „dokončení frontendu“.
Průběžně se aktualizuje. Platí pro větev `frontend/complete`.

**Stavy**

- ✅ **Hotové a ověřené**: funguje nad lokálními daty a prošlo kontrolou v prohlížeči nebo smoke testem.
- 🟡 **Částečné / chybí**: něco z požadavku chybí. Co přesně, je uvedeno u položky.
- 🔌 **Závisí na backendu nebo externí službě**: UI je připravené nebo simulované, skutečná funkce vyžaduje server nebo integraci.
- ⛔ **Mimo rozsah**: vědomě se nedělá (zadání 1.2, rozhodnutí zadavatele).

## Datová vrstva a průřezové věci

| Požadavek | Stav | Poznámka |
| --- | --- | --- |
| Sdílené typované entity a ID napříč moduly | ✅ | `lib/hub/types.ts` podle kap. 5. Fáze kontaktu je oddělená od souhlasu. Role `agency_admin`/`workspace_admin`/`member`, klient jen v portálu. |
| Perzistence v localStorage s validací a verzí formátu | ✅ | `lib/hub/store.ts`: klíč `softema-hub:data`, `SCHEMA_VERSION`, validace zod a záloha nečitelných dat do `softema-hub:data-backup`. Zápisy jsou dávkové (300 ms) a při skrytí stránky se uloží hned. |
| Ukázková data jen při první inicializaci | ✅ | `lib/hub/seed.ts`: deterministický generátor, jen smyšlená jména. E-maily kontaktů jsou na doméně `.example`. |
| Oddělení pracovních prostorů | ✅ | Každý záznam má `workspaceId` a UI čte jen přes filtr. Ověřeno smoke testem (kontakt z prostoru A není v prostoru B). |
| Záměrná obnova ukázkových dat | ✅ | Nastavení → Data a obnova: export JSON, obnova jednoho prostoru nebo všech (s potvrzením). |
| Žádné secrets v prohlížeči | ✅ | Integrace ukládají jen stav připojení a název účtu. Text, který vypadá jako API klíč, formulář odmítne (smoke test). |
| Přímé odkazy, zpět/vpřed, refresh | ✅ | Hash routy včetně filtrů a kroků v URL (`kontakty?zdroj=…`, `kampane/7/upravit?krok=3`). Data přežijí refresh. |
| Varování před neuloženými změnami | ✅ | `useUnsavedGuard` (segmenty, lekce, nastavení kurzu, produkt, webinář, faktura, scénář, chatbot, nastavení). Hlídá navigaci v aplikaci, tlačítko zpět, přepnutí prostoru i zavření stránky. Kampaně se ukládají automaticky. |
| Potvrzení destruktivních akcí | ✅ | `useConfirm` u všech mazání, stornování, vrácení plateb, anonymizace a obnovy dat. |
| Validace a chybové stavy formulářů | ✅ | Chyby se zobrazují u formuláře (`FormError`, role `alert`). Tlačítka bez platného stavu jsou zakázaná. |
| Prázdné stavy s CTA | ✅ | Seznamy mají prázdný stav a stav „nic neodpovídá filtru“. |
| Loading stav | ✅ | Skeleton do načtení localStorage. Editor Unlayer má vlastní stav načítání a po 20 s přepne na náhradní editor. |
| Propojení modulů (kap. 9) | ✅ | Časová osa kontaktu se skládá ze všech modulů. Spouštěče automatizací reagují na nový kontakt, štítek, import, registraci na webinář, dokončený kurz, platbu a lead z chatbota (`lib/hub/flow.ts`). |

## Dashboard

| Požadavek | Stav | Poznámka |
| --- | --- | --- |
| KPI a graf z reálných dat | ✅ | Kontakty, doručené e-maily, míra otevření a tržby, se srovnáním s předchozím obdobím. |
| „Zdroje nových kontaktů“ jako prstencový graf | ✅ | Celkový počet uprostřed, legenda s počty a procenty. Řádek legendy vede na filtrovaný seznam (počty sedí, ověřeno testem). |
| Rozložení: zdroje nad „Nedávnou aktivitou“, graf vlevo | ✅ | Na mobilu je pořadí graf → zdroje → aktivita → kampaně. |

## CRM

| Požadavek | Stav | Poznámka |
| --- | --- | --- |
| Seznam, hledání s diakritikou i bez, filtry, řazení, stránkování | ✅ | |
| Hromadné akce | ✅ | Štítky, fáze, zařazení do kampaně, zařazení do automatizace, export, smazání. |
| Detail: časová osa, vlastní pole, štítky, poznámky, obchody, segmenty, kurzy, automatizace | ✅ | Kap. 8.2 včetně akcí: e-mail (simulace), zařazení do kampaně nebo automatizace, úprava, GDPR. |
| Souhlasy: evidence, historie, akce | ✅🔌 | Double opt-in e-mail je simulace. |
| GDPR export, anonymizace a výmaz | ✅ | Účetní záznamy zůstávají a ukazují „Smazaný kontakt“. |
| Segmenty s živými počty | ✅ | |
| CSV import s mapováním, validací a deduplikací | ✅ | |
| Pipeline se změnou fáze obchodu | ✅ | Drag & drop i nabídka „Přesunout do“. |

## E-mailing

| Požadavek | Stav | Poznámka |
| --- | --- | --- |
| Seznam kampaní s akcemi podle stavu | ✅ | |
| Průvodce (údaje → příjemci → obsah → kontrola) | ✅ | Automatické ukládání, kontrolní seznam před odesláním (ověřená doména, souhlasy, odkaz na odhlášení). |
| Editor Unlayer | ✅🔌 | Běží bez účtu: branding Unlayer, bez prémiových funkcí, skript z `editor.unlayer.com`. Ukládá design JSON i HTML. Volitelný veřejný `NEXT_PUBLIC_UNLAYER_PROJECT_ID`. Náhradní vestavěný editor s undo/redo. |
| Náhled desktop/mobil, merge tagy, test | ✅🔌 | HTML náhled je v sandboxovaném iframe. Testovací e-mail je simulace. |
| Plánování a odeslání | ✅🔌 | Simulace. Výsledky se generují lokálně, odhlášení z kampaně odvolá souhlas. |
| Report kampaně | ✅🔌 | Metriky, graf otevření v čase, trychtýř, odkazy, příjemci s filtrem, opětovné odeslání neotevřeným. Časy otevření jsou odvozená simulace, skutečné dodá tracking. |
| Doručitelnost, webhooky, suppression, tracking, preferenční centrum | 🔌 | Backend (Resend, BullMQ). Domény a DNS záznamy jsou v Nastavení. |

## Kurzy a digitální produkty

| Požadavek | Stav | Poznámka |
| --- | --- | --- |
| Seznam kurzů (koncept/publikováno), vytvoření a úprava | ✅ | Název, popis, obrázek (data URL do 400 kB), cena a typ ceny, dostupnost (drip), certifikát. |
| Struktura kurz → moduly → lekce | ✅ | Přidání, přejmenování, řazení, přesun mezi moduly, mazání. |
| Obsah lekce, drip | ✅🔌 | Odkaz na video, text, kvíz, přílohy (jen metadata). Mux a podepsané URL přijdou s backendem. |
| Studenti propojení s CRM a jejich postup | ✅ | |
| Náhled studenta a přehrávač, oddělený od administrace | ✅ | Drip zámky, kvíz, postup se ukládá a zapisuje do časové osy, certifikát. |
| Digitální produkty | ✅🔌 | Soubory jen jako metadata. Stahování přes podepsanou URL přijde s backendem. |

## Webináře

| Požadavek | Stav | Poznámka |
| --- | --- | --- |
| Seznam live/evergreen se stavy, akce podle data a stavu | ✅ | |
| Vytvoření a úprava | ✅ | Název, popis, obrázek, datum, časové pásmo (ukládá se v Europe/Prague), zdroj videa. |
| Registrační stránka s funkční registrací | ✅ | Deduplikace kontaktu i registrace, štítek, spouštěč automatizace. |
| Potvrzení, připomínky, follow-up | ✅🔌 | Nastavení a vypočtené časy. Odesílání je simulace. |
| Účast, záznam, výsledky | ✅🔌 | Účast se zapisuje ručně nebo simulací. Data z LiveKit/Mux přijdou s backendem. |
| Náhled účastníka | ✅ | Čekárna, simulované vysílání s lokálním chatem, okno záznamu. |

## Ostatní moduly

| Modul | Stav | Poznámka |
| --- | --- | --- |
| Automatizace (React Flow) | ✅🔌 | Úpravy uzlů, větvení Ano/Ne, vkládání kroků, validace, uložení, aktivace a simulovaný krok běhu. Skutečný běh (BullMQ) přijde s backendem. |
| Platby | ✅🔌 | Faktury (koncept → odeslaná → zaplacená/po splatnosti/stornovaná), transakce (vrácení, opakování), předplatné, platební odkazy, kupóny. Nic se neúčtuje. |
| Komunita | ✅🔌 | Skupiny, členové, příspěvky, komentáře, moderace, náhled přístupu. Notifikace e-mailem a obrázky v příspěvcích přijdou s backendem. |
| Chatbot | ✅🔌 | Vzhled, znalostní báze, chování, instalace, živý náhled. Testovací chat je lokální vyhledávání (ne Claude API). Lead se uloží do CRM. |
| Nastavení | ✅ | Profil, prostor, branding a portál, tým a role, domény a odesílatelé, integrace, notifikace, data a obnova. Změny se promítají do UI. |
| Klientský portál (8.6) | 🔌 | Oddělená autentizace klientů závisí na backendu. Náhledy (student, účastník, přístup do komunity, portál v brandingu) jsou hotové. |
| Autentizace (8.1) | 🔌 | Přihlášení/registrace jsou původní statické stránky. Přepínač prostoru není oprávnění. |

## Mimo rozsah

- ⛔ AI agenti (`app/ai-agents.tsx`): skryto z navigace, kód zachován, nerozvíjí se.
- ⛔ Kalendář, sociální sítě, landing builder, inbox, recenze, affiliate, ad manager (zadání 1.2).
- ⛔ Landing page a `/funkce`: ponechané beze změn.
- 🔌 Backend (NestJS, Prisma, PostgreSQL/RLS), autentizace (Better-Auth), rozesílky (Resend), platby (Stripe, Fakturoid), video (Mux, LiveKit), úložiště (S3/R2) a Claude API se v této etapě nezapojují.

## Průběh a navázání

Větev `frontend/complete` (lokálně, bez push). Moduly jdou po sobě v samostatných commitech:

1. datová vrstva, dashboard, CRM a e-mailing,
2. kurzy,
3. webináře,
4. automatizace,
5. platby,
6. komunita,
7. chatbot,
8. nastavení,
9. testy a dokumentace.

### Výsledky kontrol (poslední stav)

| Kontrola | Výsledek |
| --- | --- |
| `tsc --noEmit` | bez chyb |
| ESLint (celý projekt) | 0 chyb, 8 varování (6× `<img>` pro data URL, 2× nepoužité proměnné v původním `marketing.tsx`) |
| `node --test tests/foundation.test.mjs tests/hub.test.mjs` | 16/16 prošlo |
| `next build` | prošel, všechny stránky statické |
| Smoke testy (`e2e/smoke.spec.ts`) proti produkčnímu buildu, včetně `E2E_UNLAYER=1` | 38 prošlo, 6 přeskočeno (testy jen pro desktop nebo jen pro mobil) |
| Vizuální testy (`e2e/visual.spec.ts`) | běží, ale liší se od původních referenčních snímků (nový vzhled). Reference se přepíšou až po schválení (`pnpm test:e2e:reference`). |
| Ruční průchod | desktop 1440 a mobil 390, světlé i tmavé téma, oba pracovní prostory |

### Otevřené body a rozhodnutí pro zadavatele

- Schválit nový vzhled, potom přepsat referenční snímky.
- Unlayer: rozhodnout o účtu a `projectId`. Bez účtu je vidět branding Unlayer, chybí prémiové funkce a rozhraní editoru je anglicky (locale `cs` se bez účtu neprojevilo).
- Graf otevření v reportu a výsledky kampaní jsou simulace. Skutečná data dodá tracking s backendem.
- Vše označené 🔌 potřebuje backend nebo integraci: Resend, Stripe/Fakturoid, Mux/LiveKit, S3/R2, Claude API, Better-Auth, RLS, BullMQ.
