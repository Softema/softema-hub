# Softema Hub: lokální vývoj

## Požadavky

- **Node.js 22.13.0 nebo novější** (ověřeno s Node.js 24.19.0 na Windows 11).
- **pnpm 11.25.0**, přesně podle `packageManager`. Bez globální instalace použijte `npx --yes pnpm@11.25.0 <příkaz>`.
- Pro první instalaci přístup k npm registru.

Instalujte vždy z `pnpm-lock.yaml`:

```sh
pnpm install --frozen-lockfile
```

`pnpm-workspace.yaml` vynucuje bezpečnostní pravidla pro instalaci: jen verze starší 7 dní, ověřený lockfile a instalační skripty jen pro `sharp` a `unrs-resolver`. Úložiště balíčků je lokální v `.sites-runtime/pnpm-store` (název je převzatý z původního exportu a Git ho ignoruje). Při chybě instalace nemažte lockfile a pravidla nevypínejte. Nejdřív ověřte verzi Node.js a pnpm a dostupnost registru.

## Spuštění a build

```sh
pnpm dev     # http://localhost:3000, aplikace na /aplikace
pnpm build   # produkční build do .next/
pnpm start   # spustí produkční build
```

| Adresa | Obsah |
| --- | --- |
| `/` | Landing page |
| `/funkce` | Přehled funkcí |
| `/prihlaseni`, `/registrace`, `/obnova-hesla` | Ukázkové přístupové formuláře |
| `/aplikace` | Aplikace (výchozí modul Přehled) |
| `/aplikace#kampane`, `#kontakty/1`, `#automatizace` … | Moduly a detaily (hash navigace) |

V jedné složce smí běžet jen jeden `next dev`. Druhé spuštění skončí hláškou „Another next dev server is already running“ s adresou a PID běžícího serveru.

Při prvním `pnpm dev` v prostředí s AI agentem udržuje Next.js v `AGENTS.md` blok svých pravidel. Soubor je verzovaný a `CLAUDE.md` ho importuje, takže Next.js nic dalšího negeneruje.

## Kontroly

```sh
pnpm exec tsc --noEmit --incremental false
node --test tests/foundation.test.mjs
pnpm build
pnpm test:e2e      # proti běžícímu pnpm dev nebo pnpm start; jiná adresa: E2E_BASE_URL
pnpm lint          # původní kód v app/ zatím hlásí známé nálezy
```

Referenční snímky se porovnávají na pixel a pořízené jsou na Windows, viz [e2e/README.md](e2e/README.md).

## Proměnné prostředí

**Pro současný mock frontend není potřeba žádná proměnná prostředí** a `.env.local` nevytvářejte. `.env.example` obsahuje jen prázdné nebo bezpečné hodnoty z historického plánu ([docs/MIGRACE.md](docs/MIGRACE.md)). Supabase proměnné v něm nejsou cílovým stackem: závazné je [docs/ZADANI-APLIKACE.md](docs/ZADANI-APLIKACE.md) (Better-Auth, Prisma, PostgreSQL). Žádná proměnná nic nezapojí a skutečné klíče sem nepatří.

## Co je skutečné a co simulace

| Oblast | Stav |
| --- | --- |
| Data kontaktů, kampaní a modulů | Smyšlená, jen v paměti prohlížeče. Obnovení stránky je resetuje. |
| E-mailový editor, workflow builder | Vlastní React implementace (`app/campaigns.tsx`, `app/automations.tsx`). Cílově Unlayer a React Flow. |
| Přihlášení, registrace, obnova hesla | Jen formuláře, žádné účty ani ověřování. |
| Rozesílka, platby, AI agenti, chatbot | Simulace bez externích služeb. |
| `lib/server/email/resend.ts` | Připravený adaptér Resend, nikde nezapojený. |
| `supabase/` | Historický návrh SQL a testu izolace. Neaplikovaný, cílový stack ho nepoužívá. |

Obrázky vložené do editoru jsou lokální object URL, ne trvalé uploady. WebMCP nástroje se registrují jen v prohlížeči s `document.modelContext`.

## Původ projektu

Zdroj pochází z exportu GPT Sites prototypu, publikované verze 3 (commit `b813fd42bca07dcf1b3da30a17e87c8fce3c96cb`). `SOURCE-MANIFEST.sha256` dokládá obsah tohoto původního exportu. Soubory odstraněné při migraci na Next.js v něm zůstávají uvedené, manifest se proto nepřepisuje.

Původní verze běžela na Vinextu, Vite a Cloudflare Workers tooling s instalačními skripty GPT Sites. Je uložená v lokální Git větvi `archive/sites-vinext`. Při přechodu na Next.js byl vzhled ověřen proti snímkům z této verze se shodou na pixel.
