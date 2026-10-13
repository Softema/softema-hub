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
| UI | Tailwind 4.2.1 (PostCSS), shadcn/ui v `components/ui/` (Radix), Lucide, Sonner, Recharts. Většinu vzhledu tvoří vlastní CSS (`app/globals.css`, `app/product.css`, `app/marketing.css`, `app/ai-agents.css`). Tokeny (rozestupy 4–40 px, barvy textu s kontrastem AA, radiusy, výška ovládacích prvků) a shell (sidebar, horní lišta, spodní navigace na mobilu) jsou v [app/shell.css](app/shell.css); nové styly stav na nich. Dashboard je [app/dashboard.tsx](app/dashboard.tsx) + `dashboard.css` (container queries). Grafy obaluje `ChartBox` z [app/chart-box.tsx](app/chart-box.tsx), který je připojí až s nenulovým rozměrem. |
| Testy | Playwright 1.63 (Chromium): smoke testy a snímky obrazovek v [e2e/](e2e/). `node --test` pro demo store a Resend adaptér. |
| Navigace | Veřejné routy `/`, `/funkce`, `/prihlaseni`, `/registrace`, `/obnova-hesla`, `/aplikace`. Moduly Hubu přepíná **hash** (`/aplikace#kontakty/1`) přes `go()` a `HubProvider` ([app/state.tsx](app/state.tsx)). |
| E-mailový editor | Vlastní React editor v [app/campaigns.tsx](app/campaigns.tsx) (nativní drag & drop). |
| Workflow builder | Vlastní HTML/CSS uzly v [app/automations.tsx](app/automations.tsx). |
| Data | Jen v paměti, refresh je resetuje. Výchozí záznamy jsou v [app/data.ts](app/data.ts), některé moduly mají vlastní lokální stav. |

### Migrace z GPT Sites na Next.js (dokončeno)

Vinext, Vite, Cloudflare Workers tooling, instalační skripty a plugin GPT Sites i D1/Drizzle scaffolding jsou odstraněné. Původní funkční verze je v lokální větvi **`archive/sites-vinext`**. Vzhled byl proti ní ověřen se shodou na pixel. Nic z ní nevracej bez zadání.

Pozůstatky, které zůstávají záměrně:
- lokální úložiště balíčků `.sites-runtime/pnpm-store` v `pnpm-workspace.yaml` (přesun by vyžadoval přeinstalaci),
- `SOURCE-MANIFEST.sha256`, který dokládá původní export (needituj ho),
- `supabase/` jako historický návrh,
- složka `vendor/` (styly shadcn), kterou aplikace používá.

## Rozsah aktuální etapy

**Pořadí dodávek:** migrace frameworku je hotová. Následuje **dodávka 1**: shell, dashboard, CRM a e-mailing. Uvnitř je priorita č. 1 tvorba kampaně a editor e-mailu, priorita č. 2 detail kontaktu (časová osa, vlastní pole, historie). Pak review se zadavatelem. **Dodávka 2** jsou ostatní moduly na úrovni proklikatelných hlavních obrazovek.

Rozhodnutí zadavatele:
- **Unlayer** přijde v dodávce 1 jako samostatný krok po migraci frameworku. Před integrací ověř licenci a omezení (branding, projectId, CDN). **React Flow** pro automatizace přijde v dodávce 2. Oba editory nikdy neměň současně s migrací frameworku.
- **AI agenti** ([app/ai-agents.tsx](app/ai-agents.tsx), `ai-state.tsx`, `lib/domain/ai.ts`, `lib/data/*`) i tvorba kampaní přes **AI brief** jsou mimo rozsah (zadání 1.2). Ve verzi pro review je skryj z navigace, ale kód zachovej. Bez samostatného zadání je nerozvíjej.
- **Landing page** a `/funkce` ponech, ale dál je nerozvíjej.
- Používej **pouze smyšlená data**, žádné údaje reálných klientů.
- Písmo je **Geist** načtený přes `next/font/google` (`latin` + `latin-ext` pro češtinu) v [app/layout.tsx](app/layout.tsx). Další font přidávej jen se zdůvodněním.
- Nic z kap. 1.2 zadání nenavrhuj ani nepřipravuj (kalendář, sociální sítě, landing builder, inbox, recenze, affiliate, ad manager).

## Design, mock data a chování

- Vizuální reference je současná lokálně běžící aplikace (snímky v `e2e/__screenshots__/`). Používej stávající komponenty z [app/ui.tsx](app/ui.tsx) a `components/ui/`, CSS proměnné, světlý vzhled a oranžový akcent. Nový design nevymýšlej.
- Dodržuj interakční standard zadání (kap. 7): hover/focus/disabled stavy, prázdné stavy s CTA, toasty, modaly a obousměrné prokliky (seznam ↔ detail, kampaň ↔ editor). Zachovej responzivitu, popisky formulářů a ovládání klávesnicí.
- `useHub()` vrací kontakty a kampaně filtrované podle prostoru, ale jejich settery mění celé kolekce. Zachovávej záznamy ostatních prostorů a kontroluj `workspaceId`.
- Přepínač prostoru je jen demo navigace, ne oprávnění. Označení „ukázka/simulace“ zachovej. Toast není důkaz uložení ani odeslání.
- Obrázky v editoru jsou lokální object URL, ne trvalé uploady. Registrace WebMCP v `state.tsx` musí zůstat podmíněná existencí `document.modelContext`.
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
node --test tests/foundation.test.mjs   # izolace demo store + Resend adaptér s mock fetch
pnpm test:e2e            # Playwright proti běžící aplikaci (výchozí :3000, jinak E2E_BASE_URL)
pnpm test:e2e:reference  # přepíše referenční snímky; jen po schválené změně vzhledu
```

- V jedné složce smí běžet jen jeden `next dev`. Pokud už běží, druhý skončí s adresou a PID prvního. Cizí server neukončuj, použij ho, nebo pro ověření spusť `pnpm build` a `pnpm start --port <jiný>`.
- Server pro e2e se nespouští automaticky, detaily jsou v [e2e/README.md](e2e/README.md).
- Při chybě instalace nemaž lockfile a nevypínej instalační ochrany v `pnpm-workspace.yaml`.

## Ověření změny

- U změny kódu: `tsc` a přiměřeně `pnpm build`. Při zásahu do demo store nebo Resend adaptéru spusť `tests/foundation.test.mjs`. CI ([.github/workflows/verify.yml](.github/workflows/verify.yml)) spouští install, `tsc`, foundation testy a build. Lint a snímky zatím jen lokálně.
- U UI změny: `pnpm test:e2e`. Snímky jsou porovnávané na pixel a pořízené na Windows (`-win32`), takže platí jen na stejném stroji a v Chromiu. Záměrnou změnu vzhledu nech schválit a teprve pak aktualizuj referenci. Selhání neobcházej zvyšováním tolerance.
- Ručně projdi dotčenou cestu včetně úzké obrazovky. U editoru: přidání/přesun bloku, editace, undo/redo a návrat do kampaně. U stavu: přepnutí workspace.
- Smoke testy rozšiřuj s novými prokliky, ale nepiš testy, které jen opisují implementaci.
- Pokud něco nešlo ověřit, napiš přesně co. Na závěr uveď, co se změnilo, které kontroly skutečně prošly a co zbývá. Prototyp neoznačuj za produkčně připravený.
- `SOURCE-MANIFEST.sha256` dokládá původní export. Nepřepisuj ho tak, aby změněný kód vypadal jako původní.

## Next.js pravidla pro agenty

Next.js 16 se od starších verzí liší. Před psaním Next.js kódu si přečti relevantní průvodce v `node_modules/next/dist/docs/` (viz `AGENTS.md`).

`AGENTS.md` spravuje `next dev`, needituj ho ručně. Ověřené chování (`next/dist/server/lib/generate-agent-files.js`): blok se zapisuje jen při `next dev`, jen při detekci AI agenta a jen pokud chybí. Je-li v `AGENTS.md`, `next dev` tento soubor (`CLAUDE.md`) nemění. Nastavení `agentRules` v `next.config.ts` proto není potřeba. Import níže ponech, aby se pravidla Next.js načítala.

@AGENTS.md
