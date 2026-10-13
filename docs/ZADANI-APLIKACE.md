# ZADANI-APLIKACE.md — Softema Hub

**Kompletní zadání aplikace · stavba od nuly**

| | |
|---|---|
| **Produkt** | Softema Hub *(pracovní název)* — česká all-in-one marketingová & CRM platforma |
| **Pro** | Softema Creative s.r.o. |
| **Realizace** | Claude Code + engineering dohled Softema |
| **Verze** | 1.0 · 25. 9. 2026 |
| **Status** | Závazné zadání — jediný zdroj pravdy pro vývoj |

---

## 0. Účel dokumentu

Toto je **úplné a samostatné zadání** pro stavbu platformy Softema Hub od nuly. Obsahuje výhradně moduly, které chceme, a definuje, jak spolu vše souvisí. Dokument je psán tak, aby podle něj šlo aplikaci postavit bez dalších podkladů.

**Přístup:** nejdřív postavit **pevný základ** (kap. 8.1–8.3), na kterém stojí všechno ostatní, a moduly přidávat po fázích (kap. 10). Základ musí být od začátku správně navržený — hlavně datový model, multi-tenancy a bezpečnost, protože ty se špatně mění.

Klíčová vlastnost celé platformy: **všechno je propojené přes kontakt a workspace.** Platba, kurz, komunita, webinář i chatbot se sbíhají u konkrétního kontaktu v CRM a mohou spouštět automatizace (kap. 9).

---

## 1. Rozsah aplikace

### 1.1 Moduly, které stavíme

| # | Modul | Role |
|---|-------|------|
| A | **Základ:** multi-workspace, autentizace, role a oprávnění | Nutný základ všeho |
| B | **CRM** — kontakty, segmenty, tagy, vlastní pole, časová osa | Páteř, na kterou se věší vše |
| C | **E-mailing přes Resend** — kampaně, editor, doručitelnost | Priorita č. 1 |
| D | **Automatizace** — vizuální workflow builder | Hlavní odlišení |
| E | **Platby** — Stripe + Fakturoid | Fakturace, předplatné, platební odkazy |
| F | **Klientský portál** — přihlášení klientů | Přístup ke kurzům/komunitě/produktům |
| G | **Kurzy + digitální produkty** — membership | Prodej vzdělávacího a digitálního obsahu |
| H | **Komunita** — skupiny, feed, členství | Ve stylu Skool |
| I | **Webináře** — live + evergreen | Registrace, přehrávání, replay |
| J | **Chatbot** — webový AI chatbot | Vzhled + znalostní báze + chování |

### 1.2 Vědomě mimo rozsah (neimplementovat)

Kalendář a rezervace, plánovač sociálních sítí, page/landing builder (sites), unified inbox (conversations), reputation/recenze, affiliate, ad manager, širší „AI studio" nad rámec chatbota.

> Tyto věci **nenavrhovat, nechystat pro ně schéma ani UI.** Mohou přijít později jako samostatné zadání.

---

## 2. Principy a pravidla

1. **Základ první.** Fáze A–C tvoří použitelné jádro; teprve pak platby, portál, kurzy, komunita, webináře, chatbot.
2. **Vše propojené.** Každý modul zapisuje na časovou osu kontaktu a umí být triggerem/akcí automatizace (kap. 9).
3. **Bezpečnost je vlastnost každé fáze**, ne samostatná etapa (kap. 6). Pracujeme s osobními údaji (jména, e-maily, telefony) mnoha klientů.
4. **Čeština first.** Celé UI, systémové e-maily i hlášky česky (kap. 3.3 níže).
5. **Vše těžké běží asynchronně.** Odesílání e-mailů, běh automatizací, import, trénink chatbota, zpracování videa — vždy fronta + worker, nikdy v request-response cyklu.
6. **Vyměnitelné integrace.** Každá externí služba za adapterem (Resend, Stripe, Mux…).
7. **Malé ověřitelné kroky.** Návrh (schéma + API + skica) → schválení → kód → testy (kap. 15).

---

## 3. Architektura

### 3.1 Multi-tenant „workspace" model

- **Agenturní úroveň** (Softema) → pod ní **izolované workspacy** klientů. Každý workspace má vlastní kontakty, kampaně, platby, kurzy, komunitu, webináře i chatbota — striktně oddělené.
- **Izolace dat:** PostgreSQL **Row-Level Security (RLS)** + povinné `workspace_id NOT NULL` na každé tenant entitě. RLS se nikdy „dočasně" nevypíná.
- **Role:** `agency_admin`, `workspace_admin`, `member`, `client` (klient přes portál — jiná auth doména, viz 8.6).

### 3.2 Logické vrstvy

| Vrstva | Odpovědnost |
|--------|-------------|
| Web (frontend) | UI modulů, buildery (e-mail, workflow), dashboardy |
| API backend | Business logika, autentizace, multi-tenancy, orchestrace |
| Worker / fronta | Odesílání e-mailů, běh automatizací, importy, trénink chatbota, webhooky |
| Workflow engine | Durable běh sekvencí (čekání dny/týdny, retry, větvení) |
| Databáze + cache | PostgreSQL (data + RLS + pgvector), Redis (fronty, cache, rate-limit) |
| Úložiště | S3-kompatibilní (média, přílohy, soubory produktů, exporty) |
| Adaptéry | Resend, Stripe, Fakturoid, LiveKit, Mux, Claude API… |

### 3.3 Lokalizace

Celé UI a systémové texty **česky** (jediný jazyk MVP; architektura připravená na i18n — texty ve slovnících, ne hardcoded). Vlastní česká terminologie. Formáty `cs-CZ`: datum `25. 9. 2026`, 24h čas, `Kč` výchozí měna. **Hledání s diakritikou i bez** (`unaccent` + `pg_trgm`). České skloňování v počítadlech (1 kontakt / 2 kontakty / 5 kontaktů).

---

## 4. Technologický stack (zamknutý)

| Oblast | Volba |
|--------|-------|
| Frontend | Next.js (App Router) + React + TypeScript, Tailwind + shadcn/ui |
| Buildery | Unlayer (e-mailový editor), React Flow (workflow), Tiptap (rich text) |
| Backend | NestJS (TypeScript), REST + webhooky |
| ORM | Prisma (migrace jen přes `prisma migrate`) |
| Data | PostgreSQL + Row-Level Security + **pgvector** (znalostní báze chatbota) |
| Fronty | Redis + BullMQ |
| Workflow engine | BullMQ delayed jobs + persistentní stav běhu v DB; Temporal.io jako upgrade path (PoC ve fázi D) |
| E-mail | **Resend** za adapterem `EmailProvider` |
| Platby | Stripe (karty, předplatné, odkazy) + Fakturoid (české faktury) |
| Video | LiveKit (live), Mux nebo Cloudflare Stream (evergreen/replay) |
| AI (chatbot) | Claude API (generování odpovědí), pgvector (retrieval) |
| Auth | Better-Auth (e-mail+heslo, 2FA TOTP, organizace/role); oddělená auth pro klientský portál |
| Soubory | S3/R2 s pre-signed URL |
| Provoz | Docker + Hetzner (EU), GitHub Actions CI/CD, Sentry, Grafana/Prometheus, Better Stack |
| Monorepo | pnpm + Turborepo: `apps/web`, `apps/api`, `apps/worker`, `packages/db`, `packages/shared`, `packages/email` |

Jednotný TypeScript napříč celou codebase.

---

## 5. Datový model — jádro

Návrh a schválení schématu je **první krok fáze A.** Skupiny entit podle domén (u všech tenant entit platí `workspace_id`):

**Základ a přístupy**
| Entita | Klíčová pole |
|--------|--------------|
| `Agency` | vlastník platformy; má mnoho Workspaces |
| `Workspace` | patří Agency; izoluje veškerá data |
| `User` / `Membership` | uživatel + role ve workspace |
| `ApiKey` | hashovaný klíč per workspace, scope, log použití |
| `AuditLog` | kdo / kdy / co (přístupy a změny osobních údajů) |

**CRM**
| Entita | Klíčová pole |
|--------|--------------|
| `Contact` | jméno, e-mail, telefon, firma, zdroj, custom fields (JSONB), `deleted_at` |
| `Tag` / `ContactTag` | tagy, M:N na Contact |
| `Segment` | uložený filtr (chytrý seznam) |
| `Pipeline` / `Stage` / `Deal` | lehká pipeline: fáze + obchod (contact_id, hodnota, měna, stav) |
| `Consent` | GDPR souhlas: stav, časové razítko, zdroj, IP; double opt-in |
| `Activity` | časová osa: typ události, payload, čas (viz kap. 9) |
| `Note` | interní poznámka týmu ke kontaktu |
| `Form` / `FormSubmission` | lead formuláře jako trigger |

**E-mailing**
| Entita | Klíčová pole |
|--------|--------------|
| `EmailTemplate` | design JSON (Unlayer) + renderované HTML (sanitizované) |
| `Campaign` | šablona, segment, plán, stav, statistiky |
| `EmailEvent` | sent/delivered/open/click/bounce/complaint/unsubscribe |
| `SuppressionEntry` | potlačené adresy (hard bounce, complaint, unsubscribe) — per workspace + globálně |
| `SendingDomain` | odesílací doména + stav SPF/DKIM/DMARC |

**Automatizace**
| Entita | Klíčová pole |
|--------|--------------|
| `Workflow` | definice (JSON graf uzlů), stav aktivní/pozastavené, spouštěč |
| `WorkflowRun` | běh nad kontaktem: aktuální uzel, stav, `next_run_at` |

**Platby**
| Entita | Klíčová pole |
|--------|--------------|
| `Product` | název, typ (jednorázový/subscription/digitální), Stripe product/price ID |
| `Invoice` | contact_id, Stripe + Fakturoid ID, částka, měna, stav, položky, pdf_url |
| `PaymentLink` | Stripe link ID, typ, částka, produkt, statistiky |
| `Subscription` | contact_id, Stripe subscription ID, plán, stav, příští platba |
| `Transaction` | contact_id, Stripe payment_intent ID, částka, stav, metoda, refund |
| `Coupon` | kód, typ slevy, hodnota, limit, expirace, Stripe coupon ID |
| `PaymentEvent` | webhook log (event_id = idempotence, typ, payload, zpracován) |

**Klientský portál**
| Entita | Klíčová pole |
|--------|--------------|
| `ClientUser` | 1:1 na Contact, email, password_hash (argon2id), stav, magic_link_token |
| `ClientSession` | oddělené session klienta (cookie, IP, expirace) |
| `PortalSettings` | logo, barva, název portálu, vlastní doména |

**Kurzy a digitální produkty**
| Entita | Klíčová pole |
|--------|--------------|
| `Course` / `CourseModule` / `Lesson` | struktura kurzu; lekce typu video/text/soubor/kvíz, drip_delay |
| `Enrollment` | course_id, client_user_id, contact_id, stav, subscription_id |
| `LessonProgress` | stav lekce (locked/available/started/completed) |
| `DigitalProduct` / `DigitalProductFile` | produkt + soubory (s3_key) |
| `DigitalProductPurchase` | nákup + počet stažení |

**Komunita**
| Entita | Klíčová pole |
|--------|--------------|
| `CommunityGroup` | typ přístupu (public/paid/invite/course_linked), Stripe price, grace period |
| `CommunityMembership` | group_id, client_user_id, role, stav, subscription_id, expires_at |
| `Post` / `Comment` / `Reaction` | příspěvky (sanitizovaný HTML), komentáře, reakce |
| `Report` | nahlášení příspěvku/komentáře, stav moderace |

**Webináře**
| Entita | Klíčová pole |
|--------|--------------|
| `Webinar` | typ (live/evergreen), stav, termín, livekit_room_id, mux_asset_id, registrační slug |
| `WebinarRegistration` | contact_id, attended, watch_duration, source |
| `WebinarRecording` | mux_asset_id, playback_url, available_until |

**Chatbot**
| Entita | Klíčová pole |
|--------|--------------|
| `Chatbot` | vzhled (JSON), persona/systémový pokyn, fallback, nastavení lead capture/handoff, aktivní |
| `KnowledgeSource` | typ (url/dokument/qa/faq), obsah, stav tréninku (natrénováno/zpracovává se/chyba) |
| `KnowledgeChunk` | rozsekaný obsah + embedding (pgvector) |
| `ChatConversation` / `ChatMessage` | konverzace návštěvníka, vazba na Contact při lead capture |

---

## 6. Bezpečnost — first-class (závazné pro každou fázi)

### 6.1 Izolace tenantů
- `workspace_id NOT NULL` všude; **RLS na všech tenant tabulkách**; druhá vrstva filtrování v ORM (defense in depth).
- Zakázáno: skládání SQL řetězců, raw SQL bez parametrizace, cross-workspace JOINy.
- **Povinný test u každého modulu:** uživatel workspace A nevidí ani nemění data workspace B (API i DB).

### 6.2 Autentizace
- Hesla **argon2id**; politika délky, kontrola proti uniklým heslům.
- **2FA (TOTP)** pro všechny, povinná pro `agency_admin` a `workspace_admin`.
- Session: httpOnly + Secure + SameSite cookies, krátká životnost, rotace při citlivých akcích.
- Rate limiting a lockout na login a reset hesla; reset/magic tokeny jednorázové, časově omezené, v DB jen hash.
- **Klientský portál má oddělenou auth** (jiný cookie namespace, jiný token scope než admin/tým).

### 6.3 Autorizace
- Oprávnění vynucená **na API vrstvě** (guards), frontend je jen UX. API klíče hashované, scope-ované, revokovatelné.

### 6.4 Ochrana dat
- TLS + HSTS. Šifrování at rest (DB + zálohy). Citlivá pole (API klíče integrací klientů — Stripe, Fakturoid, Resend; OAuth/webhook secrets) navíc **šifrovaná aplikačně AES-256-GCM**, klíče mimo DB.
- Secrets nikdy v kódu/repu: `.env` + secret manager, `.env` v `.gitignore`, **gitleaks v pre-commit i CI**.
- **PII v lozích maskovat**; žádné osobní údaje do Sentry.

### 6.5 Aplikační bezpečnost (OWASP Top 10)
- Validace vstupů na hranici API (zod/class-validator).
- **XSS:** e-mailové šablony i obsah komunity/chatbota jsou user-generated HTML → server-side sanitizace (DOMPurify) před uložením i renderem.
- CSRF pro cookie session; security headers (helmet) vč. CSP.
- Upload: whitelist typů, limity velikosti, servírování z odděleného originu, nikdy exekuce.
- SSRF: odchozí requesty (webhooky, scraping pro chatbota, načítání obrázků) přes validaci/allowlist, blok interních IP.

### 6.6 Bezpečnost e-mailingu a webhooků
- Unsubscribe a click-tracking tokeny **podepsané (HMAC)**, ne hádatelná ID; odhlášení funguje bez přihlášení a okamžitě.
- Webhooky Resend/Stripe/Mux: **ověření podpisu + idempotence** (dedup podle event ID).
- Anti-abuse: limity objemu odeslání per workspace, ruční schválení první velké rozesílky nového workspace.

### 6.7 GDPR
- Souhlasy s razítkem, zdrojem a IP; **double opt-in** u marketingu.
- Právo na výmaz (anonymizace) a export osobních údajů kontaktu — funkce v UI od fáze B.
- EU hosting (Hetzner). Podklady pro DPA (evidence souhlasů, záznamy zpracování). *Právní stránku řeší zadavatel s advokátem.*

### 6.8 Provoz
- Zálohy automatické, šifrované, point-in-time recovery + **pravidelný restore test**.
- Monitoring/alerting (Sentry, Grafana, Better Stack). Dependency scanning (Renovate + `pnpm audit`) v CI.
- CI gate: testy + lint + typecheck + gitleaks před merge; žádný přímý push do `main`. Prostředí `dev`/`staging`/`production` oddělená.

---

## 7. Interakční standard UI

Napříč aplikací: hover/active/focus/disabled stavy, prázdné stavy s CTA, loading (spinner/skeleton) u asynchronních akcí, toast potvrzení, modaly/panely, obousměrná průchodnost (seznam → detail → zpět; kampaň → editor → zpět; workflow → nastavení uzlu → zpět; kontakt ↔ události na časové ose). *Designový jazyk je řešen samostatně — zde jde o funkční chování.*

---

## 8. Moduly — detailní specifikace

### 8.1 Základ — workspace, autentizace, role *(fáze A)*
- Registrace/přihlášení, 2FA, reset hesla, správa relací.
- Agenturní úroveň + zakládání a přepínání workspaců.
- Role a oprávnění (agency_admin / workspace_admin / member), pozvánky do týmu.
- Globální layout: sidebar (moduly), přepínač workspace, profil.
- **Propojení:** vytváří kontext `workspace_id` a role, na kterých stojí vše ostatní.

### 8.2 CRM — kontakty *(fáze B)*
- Seznam kontaktů (filtr, hledání s diakritikou i bez, hromadné akce).
- **Detail kontaktu:** hlavička (jméno, e-mail, telefon, firma, tagy, zdroj, fáze), akce (odeslat e-mail, zařadit do kampaně, přidat do automatizace, upravit, export/výmaz GDPR), sekce: **časová osa aktivit**, základní + vlastní pole, GDPR souhlasy, e-maily, platby, kurzy/členství, poznámky, segmenty.
- Vlastní pole (custom fields, JSONB), tagy, chytré segmenty (uložené filtry).
- **CSV import** s mapováním sloupců a deduplikací (podle e-mailu).
- Lehká pipeline (kanban fáze + obchod) — protože na fáze odkazuje automatizace i detail kontaktu.
- GDPR: evidence souhlasů, export a výmaz kontaktu.
- **Propojení:** kontakt je centrální entita; všechny ostatní moduly na něj odkazují a zapisují na jeho časovou osu.

### 8.3 E-mailing přes Resend *(fáze C — priorita č. 1)*
- **Kampaně:** krokový průvodce (Základ → Příjemci → Obsah → Odeslání), výběr segmentu s živým počtem příjemců, plánované odeslání.
- **Editor e-mailu (Unlayer):** drag & drop bloky, náhled desktop/mobil, merge tagy ({{jmeno}}, {{firma}}…), testovací e-mail; ukládá design JSON + sanitizované HTML.
- **Odesílání vždy asynchronně:** kampaň → dávky do BullMQ → worker → Resend batch; retry s backoffem, **idempotence** (unikát kontakt×kampaň).
- **Doručitelnost:** odesílací subdoména per workspace se SPF/DKIM/DMARC (DMARC start `p=none`), List-Unsubscribe + List-Unsubscribe-Post (one-click), warm-up, hygiena seznamů, validace při importu.
- **Webhooky Resend** → EmailEvent + **suppression** (hard bounce, complaint → okamžité odhlášení). Kontrola suppression před každým odesláním.
- **Vlastní tracking:** open pixel + podepsané click redirecty; statistiky per kampaň i kontakt.
- **Detail odeslané kampaně:** metriky (doručeno, otevření %, prokliky %, bounce, odhlášení), graf v čase, výkon odkazů, seznam příjemců se stavem (klik → detail kontaktu).
- **Preferenční centrum:** kontakt volí typy sdělení; odhlášení se okamžitě propíše do běžících automatizací.
- Adapter `EmailProvider` (send, sendBatch, verifyWebhook, parseEvent) — Resend teď, výměna později bez zásahu do logiky.
- **Propojení:** e-maily = akce automatizací i webinářů; události na časové ose kontaktu; suppression respektuje celý systém.

### 8.4 Automatizace — workflow *(fáze D)*
- Seznam workflow (stav aktivní/pozastavené, spouštěč, počet v běhu).
- **Builder (React Flow):** plátno s uzly shora dolů, „+" pro vložení kroku, panel nastavení uzlu.
  - *Spouštěče:* nový kontakt, přidán/odebrán tag, odeslán formulář, provedena platba, registrace na webinář, dokončen kurz, datum/výročí.
  - *Akce:* odeslat e-mail, počkat (min/hod/dny/týdny), podmínka (if/else — větvení), přidat/odebrat tag, změnit fázi pipeline, zařadit do kampaně, webhook (n8n), notifikace týmu.
- **Běh:** BullMQ + persistentní `WorkflowRun` (přežije restart workeru); podmínka vytvoří větve Ano/Ne. PoC Temporal.io a rozhodnutí o upgradu.
- Referenční workflow: uvítací sekvence s čekáním a větvením; „opuštěný košík" reminder.
- **Propojení:** spouštěče čtou události ze všech modulů; akce zapisují do CRM, e-mailingu, plateb. Odhlášený kontakt okamžitě vypadne ze všech běhů.

### 8.5 Platby — Stripe + Fakturoid *(fáze E)*
- **Fakturace:** vytvoření/odeslání faktury kontaktu, stavy (koncept→odeslaná→splatná→zaplacená→po splatnosti), dashboard přehledů, filtry.
- **Platební odkazy:** jednorázové i subscription přes Stripe; tracking otevření/platby → časová osa + trigger.
- **Předplatné:** správa (plán, stav, příští platba), pozastavit/zrušit/změnit.
- **Transakce:** log úspěšných/neúspěšných/vrácených ze Stripe webhooků.
- **Kupóny** (% / fixní, limit, expirace) → Stripe.
- **Fakturoid:** po úspěšné platbě automatická faktura (per workspace: IČO, DIČ, plátce/neplátce DPH).
- **Webhooky Stripe** (invoice.paid, checkout.session.completed, subscription.\*, charge.refunded…) → PaymentEvent + aktualizace stavu + volitelný trigger. Ověření podpisu + idempotence.
- Bezpečnost: Stripe klíče šifrované; žádné PAN/CVV na naší straně (vše přes Stripe Checkout/Elements).
- **Propojení:** platba → transakce/faktura → časová osa kontaktu → trigger automatizace → přístup ke kurzu/komunitě (8.7, 8.8).

### 8.6 Klientský portál *(fáze F)*
- **Oddělená auth klientů** (ClientUser, e-mail+heslo, volitelně magic link), pozvánka e-mailem.
- **Dashboard klienta:** moje kurzy (progress), moje komunity, moje faktury/předplatné — jen data daného kontaktu.
- **Branding per workspace** (logo, barva, název portálu; vlastní doména volitelně).
- Správa profilu; GDPR export/výmaz.
- Bezpečnost: striktní izolace na `contact_id` (RLS + aplikační filtr), rate limiting, oddělené session.
- **Propojení:** vstupní brána pro kurzy, komunitu a digitální produkty; ClientUser je 1:1 na Contact z CRM.

### 8.7 Kurzy + digitální produkty *(fáze G)*
- **Kurzy:** struktura kurz → moduly → lekce (video přes Mux/Stream, text přes Tiptap, soubory, kvíz); drip content; nastavení ceny (zdarma/jednorázově/subscription/součást členství); dashboard (studenti, revenue, průchod kurzem, AOV).
- **Studentský pohled** (v portálu): seznam kurzů, progress, přehrávač (Mux signed URL), označení lekce hotové → postup; certifikát (volitelně).
- **Checkout** přes Stripe → automatický přístup + tag + trigger.
- **Digitální produkty:** e-booky/šablony/audio ke stažení po zaplacení; soubory přes **pre-signed URL s expirací**, logování stažení.
- Bezpečnost: přehrávání videa i stahování jen přes podepsané URL; přístup ověřuje enrollment + stav předplatného + workspace.
- **Propojení:** enrollment vzniká z platby (8.5); přístup přes portál (8.6); dokončení kurzu = trigger automatizace.

### 8.8 Komunita *(fáze H)*
- **Skupiny** per workspace; typ přístupu: veřejná / placená (Stripe) / součást kurzu / na pozvání.
- **Feed:** příspěvky (text + obrázky), komentáře, reakce, připnutí; moderace (skrýt/smazat, nahlásit, ban), notifikace nového příspěvku (přes Resend).
- **Placené členství** přes Stripe subscription; po konci předplatného přístup automaticky odebrán (grace period per workspace).
- Bezpečnost: **sanitizace user-generated obsahu**, upload obrázků přes API s validací a odděleným originem.
- **Propojení:** členství vzniká z platby (8.5); přístup přes portál (8.6); vstup/aktivita na časové ose kontaktu.

### 8.9 Webináře *(fáze I)*
- **Live:** LiveKit (self-host vs. cloud dle počtu účastníků) — role host/moderátor/účastník, chat, automatické nahrání → replay (Mux).
- **Evergreen:** nahrané video jako „simulované živě" v naplánovaných časech.
- **Registrace:** registrační stránka → kontakt v CRM + tag + **automatická e-mailová sekvence** (potvrzení, připomínka 24h a 1h před, follow-up po) přes modul E-mailingu.
- **Statistiky:** registrovaní vs. přítomní vs. replay, doba sledování (Mux analytics), konverze.
- **Propojení:** registrace/účast = události na časové ose + triggery; sekvence běží přes automatizace + e-mailing.

### 8.10 Chatbot *(fáze J)*
- **Editor se třemi záložkami:**
  - **Vzhled:** jméno, avatar, barva, uvítací zpráva, placeholder, pozice, launcher — **živý náhled** widgetu.
  - **Znalostní báze:** přidání zdroje (URL scraping / dokument PDF-DOCX / ruční Q&A / FAQ), seznam se stavem tréninku, **testovací chat**.
  - **Chování:** persona/systémový pokyn (určuje tón), fallback, lead capture (jméno/e-mail/telefon → CRM), předání na člověka, jazyky.
- **Technika:** ingestion (scrape/parse → chunk → embedding do **pgvector**) běží asynchronně; odpovědi přes **Claude API** s retrieval-augmented generation nad znalostní bází; konverzace logované.
- „Získat kód pro web" → embed `<script>` snippet; přepínač „Aktivní na webu".
- Bezpečnost: scraping přes SSRF-safe fetch; sanitizace vstupu/výstupu; izolace znalostní báze per workspace.
- **Propojení:** lead capture zakládá/aktualizuje Contact + tag + může spustit automatizaci; konverzace na časové ose kontaktu.

---

## 9. Propojení modulů (klíčové)

Síla platformy je v provázanosti. Vše se sbíhá u **kontaktu**:

```
Kontakt (CRM) — centrální entita
  ├── dostane/otevře/proklikne e-mail  ........  modul C
  ├── zaplatí → transakce + faktura (+Fakturoid)  modul E
  ├── získá přístup ke kurzu → enrollment → progress  modul G
  ├── vstoupí do komunity → členství → příspěvky  modul H
  ├── stáhne digitální produkt  ...............  modul G
  ├── registruje se / účastní webináře  ........  modul I
  ├── napíše chatbotovi → lead capture  ........  modul J
  └── VŠE se zapisuje na ČASOVOU OSU kontaktu (Activity)

Automatizace (modul D) čte události a reaguje:
  „zaplatil"            → přidat tag + enrollment do kurzu
  „dokončil kurz"       → certifikát + nabídka dalšího kurzu
  „předplatné expiruje" → upomínkový e-mail
  „předplatné zrušeno"  → odebrat přístup + retention sekvence
  „registrace na webinář" → připomínková sekvence
  „lead z chatbota"     → uvítací sekvence
```

**Časová osa kontaktu (Activity)** sjednocuje události ze všech modulů: e-mail (sent/open/click/bounce/unsubscribe), tag přidán/odebrán, formulář, platba/faktura/refund, kurz (zapsán/lekce/dokončen), digitální produkt (koupen/stažen), komunita (vstup/příspěvek), webinář (registrace/účast/replay), předplatné (vytvořeno/obnoveno/zrušeno/expirováno), chatbot (konverzace/lead).

---

## 10. Roadmapa — fáze (základ první)

Velikost = pracnost (S/M/L/XL), ne kalendář. Každá fáze končí nasazením na staging + akceptačním testem.

| Fáze | Modul | Velikost | Klíčové DoD |
|------|-------|----------|-------------|
| **A** | Základ (workspace, auth, role, monorepo, CI/CD, RLS, monitoring) | M | Dva workspacy, cross-tenant testy zelené, deploy pipeline |
| **B** | CRM (kontakty, custom fields, tagy, segmenty, CSV import, časová osa, GDPR, lehká pipeline) | L | Import reálné DB s diakritikou; segment se správně vyhodnocuje; RLS testy |
| **C** | E-mailing přes Resend (kampaně, editor, doručitelnost, tracking, suppression, preferenční centrum) | XL | **Základ hotový (kap. 11)** |
| **D** | Automatizace (workflow builder, běh, větvení) | XL | Sekvence přežije restart; odhlášený vypadne ze všech běhů |
| **E** | Platby (Stripe + Fakturoid) | L | Platba → faktura → časová osa → trigger |
| **F** | Klientský portál (auth klientů, dashboard, branding) | M | Klient vidí jen svá data; oddělené session; RLS test |
| **G** | Kurzy + digitální produkty | XL | Zaplatí → přístup ke kurzu → sleduje lekce; produkt jen přes pre-signed URL |
| **H** | Komunita | L | Zaplatí → přístup do skupiny → po konci předplatného přístup mizí |
| **I** | Webináře (live + evergreen) | XL | Registrace → připomínka → účast → follow-up bez zásahu |
| **J** | Chatbot | XL | Natrénuje zdroje → odpovídá dle persony → lead do CRM |

**Základ, který teď stavíme = fáze A + B + C** (multi-tenant jádro, CRM, e-mailing). Ostatní fáze navazují postupně.

---

## 11. Definice hotového základu

Základ je hotový, když na jednom reálném workspace zvládneme celý e-mailingový cyklus:

- Přihlášení + workspace + role týmu (2FA).
- Import reálné databáze kontaktů (tisíce, česká diakritika) s deduplikací.
- Vlastní pole, tagy, chytré segmenty.
- Editor e-mailu + odeslání newsletteru na segment.
- Statistiky (doručeno, otevření, prokliky, odhlášení).
- Správně nastavená doručitelnost (SPF/DKIM/DMARC per workspace).
- Suppression + preferenční centrum (odhlášení a bounce se propíší okamžitě).

**Akceptační test:** *„Naimportuji reálnou databázi, pošlu newsletter na segment, vidím výsledky — a odhlášení i bounce se okamžitě projeví?"* Když ano, základ stojí a jdeme na automatizace (fáze D).

---

## 12. Integrace třetích stran

| Služba | K čemu | Fáze |
|--------|--------|------|
| Resend | Odesílání e-mailů + webhooky | C |
| Unlayer | Editor e-mailů | C |
| Temporal.io | Durable workflow (PoC → upgrade) | D |
| Stripe | Karty, předplatné, odkazy | E |
| Fakturoid | České faktury | E |
| Mux / Cloudflare Stream | Video kurzů, webinářů, replay | G, I |
| LiveKit | Živé webináře | I |
| Claude API | Odpovědi chatbota | J |
| n8n | Webhooky do stávajících automatizací | D |

---

## 13. Infrastruktura a provoz

Hetzner (EU) + Docker (Compose/Coolify na startu, K8s až při potřebě). Spravovaný PostgreSQL (+ pgvector) se zálohami a PITR. Úložiště S3/R2. GitHub Actions CI/CD. Sentry + Grafana/Prometheus + Better Stack. Oddělená prostředí dev/staging/production.

---

## 14. Bezpečnostní Definition of Done (každý PR)

- [ ] Vstupy validovány na API
- [ ] Autorizace (role + workspace) na API vrstvě
- [ ] Cross-tenant RLS test napsán a zelený
- [ ] Žádné PII v lozích
- [ ] Secrets jen v env/secret manageru
- [ ] Webhooky ověřují podpis a jsou idempotentní
- [ ] User-generated obsah sanitizován (kde relevantní)
- [ ] Testy + lint + typecheck prochází v CI

---

## 15. Pravidla vývoje s Claude Code

1. **Návrh před kódem.** Před každým modulem předložit ke schválení: DB schéma, API kontrakt, skica UI. Až po schválení kódovat.
2. **Malé ověřitelné kroky** — funkční, otestovaný celek per PR.
3. **Testy povinné:** unit (logika), integrační (API + RLS cross-tenant), e2e smoke na kritické toky (login, import, odeslání kampaně, odhlášení, platba, přístup ke kurzu).
4. **Konvence:** TypeScript `strict`, ESLint + Prettier, conventional commits, migrace jen přes Prisma.
5. **Nikdy:** secrets v kódu, vypnutí RLS „dočasně", přeskočení validace, ruční zásah do produkce mimo migrace.
6. **Bezpečnostní DoD (kap. 14) je součástí každého PR.**
7. **Dokumentace:** každý balíček README; udržovat `ARCHITECTURE.md`.
8. **Nejasnost → zeptat se**, nedomýšlet rozsah (zvlášť kap. 1.2 mimo rozsah).

---

## 16. Otevřené otázky

1. **Název produktu** (pracovně „Softema Hub").
2. **Pilotní workspace** pro první ostrý provoz základu (fáze A–C).
3. **Video hosting:** Mux vs. Cloudflare Stream (rozhodnout na PoC ve fázi G).
4. **Webináře:** očekávaný počet souběžných účastníků → LiveKit self-host vs. cloud.
5. **Komunita:** gamifikace (body, leaderboard) hned, nebo později?
6. **Klientský portál:** vlastní doména per workspace od začátku, nebo na požádání?
7. **Chatbot:** rozsah scrapingu (jen zadané URL, nebo celá doména)?

---

*Softema Hub · kompletní zadání · 25. 9. 2026. Stavíme jen moduly z kap. 1.1, plně propojené přes kontakt a workspace, s maximální bezpečností a v češtině. Základ = fáze A+B+C; ostatní přidáváme postupně.*
