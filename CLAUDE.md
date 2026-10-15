# Softema Hub — instrukce pro Claude Code

Česká all-in-one marketingová a CRM platforma agentury Softema. **Aktuální etapa: proklikatelný frontend s mock daty ke společnému review se zadavatelem.** Produkční funkcionalita (backend, auth, integrace) přijde až potom a jen na základě samostatného zadání.

## Podklady a jejich priorita

1. Aktuální zadání uživatele v konverzaci.
2. [docs/ZADANI-APLIKACE.md](docs/ZADANI-APLIKACE.md): **závazný** cílový rozsah, funkční požadavky, bezpečnost a technologický stack.
3. [docs/ZADANI-PRVNIHO-TASKU.md](docs/ZADANI-PRVNIHO-TASKU.md): priority, rozsah prototypu a pořadí dodávek. Zmínka o Claude Design už neplatí. Pokračujeme v tomto kódu (původně export z GPT Sites) v Claude Code.
4. [docs/MIGRACE.md](docs/MIGRACE.md) je **historický** dokument z doby GPT Sites (Supabase, Cloudflare/Vercel). Při rozporu má vždy přednost `ZADANI-APLIKACE.md`.

Skutečný kód má přednost před popisy jeho stavu. Rozpor mezi dokumenty, zadáním a kódem nahlas **před** úpravou, nedomýšlej ho.

## Pravidla práce

- Komunikuj česky, stručně a technicky přesně. UI, texty i ukázková data piš česky (formát `25. 9. 2026`, `Kč`).
- Implementuj jen aktuální zadání a vyber nejmenší změnu, která ho splní. Cílová architektura níže sama o sobě není pokyn k migraci.
- Před úpravou si přečti relevantní soubory a `git status --short`. Nepřepisuj cizí rozpracované změny.
- Bez zadání nedělej plošné formátování ani přepisy modulů a neaktualizuj závislosti. Dlouhé řádky v `app/*.tsx` nejsou důvod k refaktoringu.
- Repozitář je lokální (`main`, bez remote). Commitovat smíš, push, publikování, placené služby a produkční migrace ne, pokud nejsou výslovně zadané.
- Nový kód typuj (TS `strict`), žádné plošné `any` ani vypínání kontrol. Respektuj hranici mezi klientskými a serverovými importy.

## Aktuální stav

| Oblast | Stav |
| --- | --- |
| Framework | **Next.js 16.3.4** (App Router, Turbopack), React 19.2.6, TypeScript 5.9.3 (`strict`). Všechny stránky se předrenderují staticky. Hub je klientská komponenta na `/aplikace`. |
| UI | Tailwind 4.2.1 (PostCSS), shadcn/ui v `components/ui/` (Radix), Lucide, Sonner, Recharts. Většinu vzhledu tvoří vlastní CSS (`app/globals.css`, `app/product.css`, `app/marketing.css`, `app/ai-agents.css`). Tokeny (rozestupy 4–40 px, barvy textu s kontrastem AA, radiusy, výška ovládacích prvků) a shell (sidebar, horní lišta, spodní navigace na mobilu) jsou v [app/shell.css](app/shell.css); nové styly stav na nich. Dashboard je [app/dashboard.tsx](app/dashboard.tsx) + `dashboard.css` (container queries). **Téma** světlý / tmavý / podle systému: next-themes v [app/theme.tsx](app/theme.tsx) (jen `/aplikace`, veřejný web zůstává světlý); tokeny pro obě témata jsou v `shell.css` (`:root` a `.dark`). Původní styly (`globals.css`, `product.css`, `ai-agents.css`) převádí na tokeny generovaný [app/theme-legacy.css](app/theme-legacy.css). Needituj ho ručně, po změně těchto souborů spusť `pnpm theme:css`. Náhled newsletteru, šablon a widget chatbota zůstávají ve vlastním (světlém) designu. KPI karty jsou sdílená `Metric` v [app/ui.tsx](app/ui.tsx), události pro aktivitu i notifikace v [app/events.ts](app/events.ts). Grafy obaluje `ChartBox` z [app/chart-box.tsx](app/chart-box.tsx), který je připojí až s nenulovým rozměrem. |
| Testy | Playwright 1.63 (Chromium): smoke testy všech modulů a snímky obrazovek (pevný čas `2026-10-15`) v [e2e/](e2e/). `node --test` pro demo store, Resend adaptér a datovou vrstvu `lib/hub` ([tests/hub.test.mjs](tests/hub.test.mjs)). |
| Navigace | Veřejné routy `/`, `/funkce`, `/prihlaseni`, `/registrace`, `/obnova-hesla`, `/aplikace`. Moduly Hubu přepíná **hash** (`/aplikace#kontakty/1`) přes `go()` a `HubProvider` ([app/state.tsx](app/state.tsx)). |
| E-mailový editor | **Unlayer** (`react-email-editor`, skript z `editor.unlayer.com`, bez účtu) v [app/unlayer-editor.tsx](app/unlayer-editor.tsx), ukládá design JSON + HTML. Náhradní vestavěný editor bloků v [app/email-blocks.tsx](app/email-blocks.tsx). Průvodce a editor jsou v [app/campaign-wizard.tsx](app/campaign-wizard.tsx). |
| Workflow builder | **React Flow** (`@xyflow/react`) v [app/automations.tsx](app/automations.tsx). Validace, spouštěče a simulovaný běh jsou v [lib/hub/flow.ts](lib/hub/flow.ts). |
| Data | Jedna vrstva v [lib/hub/](lib/hub/): typy podle zadání kap. 5 (`types.ts`), deterministická smyšlená ukázková data jen při první inicializaci (`seed.ts`), verzované úložiště v localStorage se zod validací, zálohou a dávkovým zápisem (`store.ts`), odvozené pohledy (`logic.ts`) a operace napříč moduly (`ops.ts`, `payments.ts`, `flow.ts`). Komponenty čtou přes `useHub()` ([app/state.tsx](app/state.tsx)) a nikdy přímo localStorage. Obnova ukázkových dat: Nastavení → Data a obnova. Stav požadavků je v [docs/FRONTEND-CHECKLIST.md](docs/FRONTEND-CHECKLIST.md). |

### Migrace z GPT Sites na Next.js (dokončeno)

Vinext, Vite, Cloudflare Workers tooling, instalační skripty a plugin GPT Sites i D1/Drizzle scaffolding jsou odstraněné. Původní funkční verze je v lokální větvi **`archive/sites-vinext`**. Vzhled byl proti ní ověřen se shodou na pixel. Nic z ní nevracej bez zadání.

Pozůstatky, které zůstávají záměrně:
- lokální úložiště balíčků `.sites-runtime/pnpm-store` v `pnpm-workspace.yaml` (přesun by vyžadoval přeinstalaci),
- `SOURCE-MANIFEST.sha256`, který dokládá původní export (needituj ho),
- `supabase/` jako historický návrh,
- složka `vendor/` (styly shadcn), kterou aplikace používá.

## Rozsah aktuální etapy

**Pořadí dodávek:** migrace frameworku je hotová. Na větvi `frontend/complete` je funkční frontend všech modulů z kap. 1.1 nad lokálními daty. Stav položek a závislosti na backendu jsou v [docs/FRONTEND-CHECKLIST.md](docs/FRONTEND-CHECKLIST.md). Následuje review se zadavatelem. Prioritou zůstává tvorba kampaně a editor e-mailu, potom detail kontaktu.

Rozhodnutí zadavatele:
- **Unlayer** je zapojený bez účtu: branding Unlayer, bez prémiových funkcí, skript z CDN. Volitelný veřejný `NEXT_PUBLIC_UNLAYER_PROJECT_ID` není secret. Při nedostupnosti CDN se použije vestavěný editor. **React Flow** (MIT) pohání automatizace. Oba editory nikdy neměň současně s migrací frameworku.
- **AI agenti** ([app/ai-agents.tsx](app/ai-agents.tsx), `ai-state.tsx`, `lib/domain/ai.ts`, `lib/data/*`) i tvorba kampaní přes **AI brief** jsou mimo rozsah (zadání 1.2). Ve verzi pro review je skryj z navigace, ale kód zachovej. Bez samostatného zadání je nerozvíjej.
- **Landing page** a `/funkce` ponech, ale dál je nerozvíjej.
- Používej **pouze smyšlená data**, žádné údaje reálných klientů.
- Písmo je **Geist** načtený přes `next/font/google` (`latin` + `latin-ext` pro češtinu) v [app/layout.tsx](app/layout.tsx). Další font přidávej jen se zdůvodněním.
- Nic z kap. 1.2 zadání nenavrhuj ani nepřipravuj (kalendář, sociální sítě, landing builder, inbox, recenze, affiliate, ad manager).

## Design, mock data a chování

- Vizuální reference je současná lokálně běžící aplikace (snímky v `e2e/__screenshots__/`). Používej stávající komponenty z [app/ui.tsx](app/ui.tsx) a `components/ui/`, CSS proměnné, světlý vzhled a oranžový akcent. Nový design nevymýšlej.
- Sdílené ovládací prvky jsou v [app/kit.tsx](app/kit.tsx):
  - `OptionCombobox`: výběr štítku, plánu a podobně, i s možností vytvořit novou hodnotu. Nativní `datalist` nepoužívej.
  - `ContactPicker`: výběr kontaktů v dialozích.
  - `DateField`: datum. Na desktopu má kalendář v aplikaci, na dotykových zařízeních nativní výběr.
  - `FilterTabs`: filtrační záložky s podtržením. Segmentový přepínač `.segmented` je jen pro přepnutí režimu.
- Primární akce používají tokeny `--brand-primary`, `--brand-primary-hover` a `--brand-primary-ink` v [app/shell.css](app/shell.css). Barva #eb6536 má tmavý text, protože s bílým nesplní AA.
- Okrajové resety prvků patří do `@layer base`. Nevrstvené CSS přebije utility Tailwindu.
- Dodržuj interakční standard zadání (kap. 7): hover/focus/disabled stavy, prázdné stavy s CTA, toasty, modaly a obousměrné prokliky (seznam ↔ detail, kampaň ↔ editor). Zachovej responzivitu, popisky formulářů a ovládání klávesnicí.
- `useHub()` vrací kolekce aktivního prostoru (`w.*`). `upsert`/`patch`/`remove` hlídají `workspaceId` samy. `mutate()` dostává celý dataset, takže zachovávej záznamy ostatních prostorů a kontroluj `workspaceId`. Operace, které zasahují víc kolekcí (deduplikace kontaktu, odeslání, platba, spouštěče automatizací), patří do `lib/hub/*.ts` jako čisté funkce.
- Formuláře s explicitním uložením používají `useUnsavedGuard`. Před navigací po úspěšném uložení zavolej `setGuard(null)`. Destruktivní akce jdou přes `useConfirm` z [app/kit.tsx](app/kit.tsx).
- Přepínač prostoru je jen demo navigace, ne oprávnění. Označení „ukázka/simulace“ zachovej. Toast není důkaz uložení ani odeslání.
- Obrázky (editor, kurzy, webináře, logo) se ukládají jako data URL do 400 kB jen v prohlížeči. Nejde o trvalé uploady. U souborů (přílohy, produkty, dokumenty chatbota) se ukládají jen metadata. Registrace WebMCP v `state.tsx` musí zůstat podmíněná existencí `document.modelContext`.
- Mock UI má odpovídat cílovému datovému modelu (zadání kap. 5), například role `agency_admin`/`workspace_admin`/`member`/`client`, nebo fáze pipeline oddělené od GDPR souhlasu. Při rozporu se současným mockem se zeptej.

## Cílová architektura (závazná, ale ne pro tuto etapu)

Detail je v zadání v kap. 3–6 a 13–15. Stručně: Next.js App Router + TS strict + Tailwind + shadcn/ui; buildery Unlayer, React Flow, Tiptap; backend **NestJS** (REST + webhooky); **Prisma** (migrace jen přes `prisma migrate`); **PostgreSQL s RLS** (+ pgvector); **Redis + BullMQ** (fronty, workflow engine); **Better-Auth** (2FA, oddělená auth klientského portálu); Resend za adaptérem `EmailProvider`; Stripe + Fakturoid; S3/R2; **Docker + Hetzner (EU)**; monorepo pnpm + Turborepo (`apps/web`, `apps/api`, `apps/worker`, `packages/*`).

V aktuální etapě:
- **Neaktivuj** backend, autentizaci, databázi ani žádnou integraci. `.env.example` nic nezapojuje.
- `supabase/` a Supabase proměnné v `.env.example` jsou historický návrh v jiném stacku. Nenavazuj na ně, nerozšiřuj je a nevracej Supabase, D1 ani Cloudflare jako cíl.
- `lib/server/email/resend.ts` je připravený, nezapojený adaptér (Resend je v cílovém stacku). Nepoužívej ho k reálnému odesílání.
- Secrets nikdy nepatří do Gitu, klientského stavu, URL, logů ani do proměnných `NEXT_PUBLIC_`/`VITE_`.

## Příkazy

Node.js ≥ 22.13.0, pnpm 11.25.0. Bez globálního pnpm použij `npx --yes pnpm@11.25.0 <příkaz>`. Projekt nemá obecný skript `test`.

```sh
pnpm install --frozen-lockfile
pnpm dev                 # next dev, http://localhost:3000/aplikace
pnpm build               # next build, bez deploye
pnpm start               # next start nad hotovým buildem
pnpm exec tsc --noEmit --incremental false
pnpm lint                # pozor: v původním kódu app/ zatím hlásí chyby (any, react-hooks)
node --test tests/foundation.test.mjs tests/hub.test.mjs   # demo store, Resend adaptér, datová vrstva lib/hub
pnpm test:e2e            # Playwright proti běžící aplikaci (výchozí :3000, jinak E2E_BASE_URL)
pnpm test:e2e:reference  # přepíše referenční snímky; jen po schválené změně vzhledu
pnpm theme:css           # znovu vygeneruje app/theme-legacy.css z původních stylů
```

- V jedné složce smí běžet jen jeden `next dev`. Pokud už běží, druhý skončí s adresou a PID prvního. Cizí server neukončuj, použij ho, nebo pro ověření spusť `pnpm build` a `pnpm start --port <jiný>`.
- Server pro e2e se nespouští automaticky, detaily jsou v [e2e/README.md](e2e/README.md).
- Při chybě instalace nemaž lockfile a nevypínej instalační ochrany v `pnpm-workspace.yaml`.

## Ověření změny

- U změny kódu: `tsc` a přiměřeně `pnpm build`. Při zásahu do demo store, Resend adaptéru nebo `lib/hub` spusť `node --test tests/foundation.test.mjs tests/hub.test.mjs`. Při změně formátu uložených dat zvyš `SCHEMA_VERSION` a doplň `migrate()` v `lib/hub/store.ts`. CI ([.github/workflows/verify.yml](.github/workflows/verify.yml)) spouští install, `tsc`, unit testy a build. Lint a snímky zatím jen lokálně.
- U UI změny: `pnpm test:e2e`. Snímky jsou porovnávané na pixel a pořízené na Windows (`-win32`), takže platí jen na stejném stroji a v Chromiu. Záměrnou změnu vzhledu nech schválit a teprve pak aktualizuj referenci. Selhání neobcházej zvyšováním tolerance.
- Ručně projdi dotčenou cestu včetně úzké obrazovky. U editoru: přidání/přesun bloku, editace, undo/redo a návrat do kampaně. U stavu: přepnutí workspace.
- Smoke testy rozšiřuj s novými prokliky, ale nepiš testy, které jen opisují implementaci.
- Pokud něco nešlo ověřit, napiš přesně co. Na závěr uveď, co se změnilo, které kontroly skutečně prošly a co zbývá. Prototyp neoznačuj za produkčně připravený.
- `SOURCE-MANIFEST.sha256` dokládá původní export. Nepřepisuj ho tak, aby změněný kód vypadal jako původní.

## Next.js pravidla pro agenty

Next.js 16 se od starších verzí liší. Před psaním Next.js kódu si přečti relevantní průvodce v `node_modules/next/dist/docs/` (viz `AGENTS.md`).

`AGENTS.md` spravuje `next dev`, needituj ho ručně. Ověřené chování (`next/dist/server/lib/generate-agent-files.js`): blok se zapisuje jen při `next dev`, jen při detekci AI agenta a jen pokud chybí. Je-li v `AGENTS.md`, `next dev` tento soubor (`CLAUDE.md`) nemění. Nastavení `agentRules` v `next.config.ts` proto není potřeba. Import níže ponech, aby se pravidla Next.js načítala.

@AGENTS.md
