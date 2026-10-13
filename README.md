# Softema Hub

Česká marketingová a CRM platforma agentury Softema Creative. **Aktuální etapa: proklikatelný frontend s mock daty** ke společnému review se zadavatelem. Všechny údaje jsou smyšlené. Aplikace nemá backend a neodesílá e-maily ani platby.

Závazné zadání: [docs/ZADANI-APLIKACE.md](docs/ZADANI-APLIKACE.md). Priority a pořadí dodávek: [docs/ZADANI-PRVNIHO-TASKU.md](docs/ZADANI-PRVNIHO-TASKU.md). [docs/MIGRACE.md](docs/MIGRACE.md) je historický podklad z doby GPT Sites a zadání nepřebíjí.

## Spuštění

Node.js ≥ 22.13.0 a pnpm 11.25.0. Bez globálního pnpm použijte `npx --yes pnpm@11.25.0` místo `pnpm`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Aplikace: **http://localhost:3000/aplikace**, landing page: `http://localhost:3000/`. Vývojový server ukončíte pomocí Ctrl+C. V jedné složce může běžet jen jeden `pnpm dev`.

| Příkaz | Účel |
| --- | --- |
| `pnpm dev` | Vývojový server Next.js (Turbopack) |
| `pnpm build` | Produkční build Next.js; nic nepublikuje |
| `pnpm start` | Spuštění produkčního buildu (po `pnpm build`) |
| `pnpm exec tsc --noEmit --incremental false` | Kontrola TypeScriptu |
| `pnpm lint` | ESLint; původní kód v `app/` zatím hlásí známé nálezy |
| `node --test tests/foundation.test.mjs` | Izolace demo úložiště a Resend adaptér s mock fetch |
| `pnpm test:e2e` | Playwright: smoke testy a porovnání se snímky proti běžící aplikaci, viz [e2e/README.md](e2e/README.md) |
| `pnpm test:e2e:reference` | Přepíše referenční snímky; jen po schválené změně vzhledu |

Podrobnosti o lokálním vývoji, proměnných prostředí a původu exportu jsou v [README-LOCAL.md](README-LOCAL.md).

## Obrazovky

- **Veřejný web:** landing page, `/funkce`, `/prihlaseni`, `/registrace` (dva kroky), `/obnova-hesla`. Přístupové formuláře jsou jen ukázka bez skutečné autentizace.
- **Přehled:** grafy, změna období, odkazy do modulů.
- **Kontakty:** hledání bez diakritiky, filtry, detail s časovou osou, poznámky, štítky, editace a CSV import.
- **Kampaně:** seznam, report odeslané kampaně, příjemci a průvodce ve čtyřech krocích.
- **Editor e-mailů:** přetahování bloků, úprava obsahu, barev a zarovnání, duplikace, undo/redo, náhled na mobilu, personalizace.
- **Automatizace:** vizuální větvený scénář, přidávání a editace kroků, zoom.
- **Platby, kurzy a komunita, webináře, chatbot a nastavení** na úrovni hlavních obrazovek.

Moduly aplikace se přepínají fragmentem URL (`/aplikace#kontakty/1`). Data jsou jen v paměti a obnovení stránky je vrátí do výchozího stavu. Modul AI agentů je mimo rozsah zadání a pro review bude skrytý.

## Technologie

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui (Radix UI), Recharts, Lucide, Sonner, Playwright. Cílová produkční architektura (NestJS, Prisma, PostgreSQL s RLS, Better-Auth, Redis/BullMQ, Docker/Hetzner) je popsaná v zadání a v [CLAUDE.md](CLAUDE.md).

GitHub CI ([.github/workflows/verify.yml](.github/workflows/verify.yml)) ověřuje instalaci, typy, testy a build. Nic nenasazuje ani nerozesílá. Původní verze prototypu na Vinextu a Cloudflare Workers je uložená v lokální větvi `archive/sites-vinext`.
