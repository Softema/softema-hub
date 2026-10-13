# Softema Hub — příprava dalšího vývoje

Stav k 2. 10. 2026: interaktivní prototyp v Sites. Registrace, AI běhy, rozesílka a plánovač jsou simulované. Nic není připojené k Supabase, Resend ani novému GitHub repozitáři. SQL níže je připravený návrh, nikoli aplikovaná produkční migrace.

## Produktový model

- **Organizace** je samostatný zákazník platformy: agentura nebo firma. Softema je první agenturní organizace.
- **Pracovní prostor** patří jediné organizaci. Agentura má interní prostor a oddělené prostory klientů.
- **Členství** určuje přístup. Organizace klienta a klientský prostor uvnitř agentury nejsou totéž. Samostatně registrovaná firma dostane vlastní organizaci a první prostor.
- Přístup klienta do agenturního prostoru je explicitní pozvánka. Organizace není určena e-mailovou doménou ani názvem firmy.
- UUID identifikuje organizaci i prostor. Jejich jména se mohou měnit bez přesunu dat.

| Role | Dosah |
| --- | --- |
| Vlastník / správce organizace | Všechny prostory vlastní organizace; správa členů přes ověřené serverové akce |
| Člen / host organizace | Pouze výslovně přiřazené prostory |
| Správce prostoru | Obsah prostoru a správa jeho integrací podle serverových oprávnění |
| Editor prostoru | Práce s obsahem; bez správy členství a čtení tajných klíčů |
| Čtenář prostoru | Jen čtení přiděleného prostoru |

Platformní superadministrátor není běžná role zákazníka. Pokud vznikne interní podpora, její přístup musí být oddělený, auditovaný a dočasný.

## Co je připraveno v kódu

| Soubor | Účel |
| --- | --- |
| `lib/domain/tenancy.ts` | Organizace, role, stabilní ID a `WorkspaceScope` |
| `lib/domain/ai.ts` | Přenositelný model agentů, scénářů a běhů |
| `lib/data/demo-workspace-store.ts` | Aktuální paměťová data AI, oddělená podle organizace a prostoru |
| `lib/data/ai-repository.ts` | Budoucí asynchronní rozhraní pro serverové operace |
| `app/ai-state.tsx` | Místo pro napojení načítání a mutací; UI nezná Supabase SDK |
| `lib/server/email/resend.ts` | Připravený serverový odesílač Resend, ve výchozím stavu vypnutý |
| `supabase/migrations/202610020001_foundation.sql` | Návrh Postgres tabulek, RLS a vazeb v rámci prostoru |
| `supabase/migrations/202610020002_email.sql` | Návrh odesílatelů, fronty zpráv, událostí a odhlášení pro Resend |
| `.env.example` | Prázdné konfigurační proměnné bez tajných hodnot |

Aktuální přepínač prostoru je navigace ukázky, nikoli bezpečnostní kontrola. Kontakty a kampaně již nesou `workspaceId`; starý `workspace` zůstává zobrazovacím názvem. Jejich číselná demo ID se při skutečném importu musí převést na UUID v jedné mapovací transakci. Demo data do produkce automaticky neimportovat.

Nová AI data jsou oddělená přes paměťový adaptér. Implementace `AIRepository` pro Supabase ještě neexistuje. Při napojení nahradit mutace cache asynchronními serverovými akcemi, doplnit načítání, chyby, zachování rozepsaných formulářů a zneplatnění cache. Pouhé nastavení proměnných prostředí aplikaci na backend nepřepne.

## Supabase a identita

1. Vytvořit oddělené vývojové a produkční Supabase prostředí. Schémata poprvé aplikovat pouze do testovacího projektu; nejsou zatím prověřená proti živému Supabase.
2. Zapojit Supabase Auth a skutečné přihlášení, registraci a obnovu hesla. Nahradit demo auth v `app/access.tsx`. `app/chatgpt-auth.ts` je nevyužitý hostingový helper; nebrat jeho hlavičky jako identitu mimo Sites.
3. Při založení organizace server v transakci vytvoří organizaci, vlastnické členství a první prostor. Veřejnou registraci zapnout až po dokončení tohoto postupu a limitů.
4. Identitu vždy načíst z ověřené session na serveru. `organizationId`/`workspaceId` z URL či klienta jsou pouze požadovaný rozsah, nikdy důkaz oprávnění.
5. Používat klienta se session uživatele, aby platilo RLS. Privilegovaný klíč pouze pro ověřené administrativní operace a pracovníky na pozadí. Server musí prověřit členství i při použití privilegovaného klíče.
6. Schéma `private` neuvádět mezi Exposed schemas. RLS musí zůstat zapnuté pro všechny produktové tabulky. Členství a role mění pouze server; uživatel si nesmí udělit roli sám.
7. Ověřit dvě cizí organizace, dva klientské prostory, všechny role, změnu ID v požadavku a přístup bez přihlášení. Připravený test: `supabase/tests/tenant-isolation.sql`.

Schéma pokrývá základ identity, CRM, kampaně, AI a rozesílku. Platby, faktury, kurzy, webináře, chatbot a původní vizuální automatizace zůstávají samostatné prototypy. Před jejich skutečným zapojením doplnit vlastní normalizované tabulky a pravidla. Nepoužívat obecnou veřejnou JSON tabulku jako náhradu oprávnění.

## AI klíče a automatizace

- `ai_connections` obsahuje jen metadata. Token vložit přes samostatný ověřený serverový endpoint; nikdy přes klientský repository, prohlížečové úložiště, URL, log nebo Git.
- `private.ai_credentials` je příprava úložiště šifrovaných tokenů. Šifrování/dešifrování není implementované. Použít serverové autentizované šifrování, oddělený šifrovací klíč v secrets a verzi pro rotaci; do databáze neukládat plaintext.
- Autorizovat každé spuštění, připojení i změnu scénáře; model nesmí volit libovolný prostor nebo cizí integraci. Ověřit model vůči serverovému seznamu a nastavit limity tokenů, rozpočtu, délky běhu a souběhu podle organizace.
- Plánovač a webhook pouze vytvoří trvalý job; pracovník zpracuje run mimo HTTP požadavek. Počítat s opakováním, idempotencí, backoff, maximem pokusů a záznamem chyby. Časové plány interpretovat v IANA zóně Europe/Prague včetně změn letního času.
- U běhu uložit snímek pokynů/modelu. Výstupy AI považovat za nedůvěryhodné; zatím vždy návrh ke kontrole, bez automatického odesílání kampaní.
- Smazání agenta s historickými běhy řešit archivací; současné demo umožňuje odstranit kartu, SQL záměrně chrání existující odkazy. Připojení nejprve odvolat a přiřadit náhradní model.

## Resend jako jediný poskytovatel rozesílky

Volba poskytovatele je pevná: **Resend**. API klíč dodá vlastník později. Není potřeba měnit e-mailový editor ani zavádět výběr dalšího poskytovatele.

- Připravený adaptér používá standardní `fetch`, jeden adresát = jeden job. Nikde se nyní nevolá. Zapnutí vyžaduje nejen klíč, ale i výslovné povolení odesílání a dokončení serverových kontrol.
- `RESEND_API_KEY` je serverový klíč agentury pro první provoz. Odesílací domény a adresy evidovat podle pracovního prostoru; klient nesmí zadáním `from` použít doménu jiného klienta. Ověřit doménu v Resend. Budoucí oddělené účty zákazníků přidat přes stejný mechanismus šifrovaných připojení, nikoli public env.
- Před vložením do fronty ověřit oprávnění, souhlas se zasíláním, odhlášení, potlačené adresy, platnost příjemce a limity organizace. Před každým skutečným pokusem o odeslání znovu ověřit odhlášení.
- V `email_messages` držet snímek personalizované zprávy, vlastní trvalou idempotenci a Resend message ID. API idempotence Resend má omezené časové okno; nenahrazuje vlastní frontu. Po nejasném výsledku kvůli timeoutu nesmí pozdější retry slepě vytvořit novou zprávu.
- Přijatý API požadavek znamená `accepted`, nikoli doručený. Výsledné stavy aktualizuje webhook. Ověřit podpis nad nezměněným raw body (Svix), deduplikovat event ID, ošetřit události mimo pořadí a přiřadit prostor podle uloženého message ID, nikdy podle údajů dodaných návštěvníkem.
- Implementovat podepsané odhlašovací URL v těle i hlavičkách, veřejný idempotentní endpoint pro one-click POST a suppression po bounce/complaint. Surový token pro odhlášení neukládat; ukládat hash nebo ověřovat podpis.
- Registrace aplikace a marketingové odběry jsou oddělené. Přihlašovací zprávy Supabase případně řešit samostatným SMTP nastavením Resend; marketingový API adaptér sám Supabase Auth e-maily nepřesměruje.

## Hosting: dvě budoucí cesty

| Cíl | Co připravit při přesunu |
| --- | --- |
| Cloudflare Workers | Zachovat Vinext/Vite, nahradit Sites publishing vlastní Workers konfigurací, secrets a build/deploy procesem. Pro automatizace použít trvalou frontu a plánovač. D1 není potřeba, pokud data zůstanou v Supabase. |
| Vercel | V samostatné větvi přejít na standardní Next.js build (`next build`) a ověřit kompatibilitu. Odstranit z této větve Sites build hook a Cloudflare-only runtime importy; nastavit Next.js projekt na Vercel. Dlouhé AI a e-mailové joby svěřit trvalému workeru/frontě. |

Současný `build` produkuje Workers výstup, není hotovým Vercel balíkem. Frontend a doménové typy jsou přenositelné; hostingový adaptér ještě bude potřeba upravit a otestovat. Tento požadavek nemění aktuální hosting v Sites.

## GitHub předání

Zdrojové soubory jsou v jednom běžném projektu s `package.json` a uzamčenými závislostmi. Připravený export neobsahuje `node_modules`, build výstupy, historii Sites repozitáře ani skutečné klíče. Nový GitHub repozitář zatím nebyl založen.

Při pozdějším přesunu: založit soukromý repozitář, vložit čistý zdroj, ověřit absenci tajných hodnot, použít CI z `.github/workflows/verify.yml` a chránit hlavní větev. Přesun databáze nesmí běžet automaticky z běžného frontendového buildu. Manifest `.openai/hosting.json` zachovat do ukončení práce v Sites; po úplném přesunu archivovat/odstranit v migrační větvi, nikoli teď.

## Ověření před ostrým spuštěním

Dokončit skutečný Auth, RLS integrační testy na Supabase, tenantové kontroly serverových akcí, šifrování a rotaci klíčů, fronty a webhooky, odhlášení, zálohy a obnovu. Teprve potom vypnout demo, zapnout rozesílku a otevřít veřejnou registraci. Aktuální ověření TypeScriptu a demo izolace nenahrazuje tyto provozní testy.

## Oficiální podklady

- [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: zabezpečení API](https://supabase.com/docs/guides/api/securing-your-api)
- [Resend: Send Email](https://resend.com/docs/api-reference/emails/send-email)
- [Resend: webhooky](https://resend.com/docs/webhooks/introduction)
- [Resend: typy událostí](https://resend.com/docs/webhooks/event-types)
- [Cloudflare: Next.js a Vinext](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Vercel: Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs)
