# Softema Hub

Česká marketingová a CRM platforma agentury Softema Creative.

**Databázová verze** (přihlášení a kontakty nad PostgreSQL, jen lokálně): [docs/LOKALNI-VYVOJ.md](docs/LOKALNI-VYVOJ.md), architektura v [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Demo** (níže) je proklikatelný frontend nad lokálními daty. Všechny údaje jsou smyšlené. Aplikace nemá backend a neodesílá e-maily ani platby. Odeslání, platby, vysílání a tréninky jsou v aplikaci výslovně označené jako simulace.

Závazné zadání: [docs/ZADANI-APLIKACE.md](docs/ZADANI-APLIKACE.md). Priority a pořadí dodávek: [docs/ZADANI-PRVNIHO-TASKU.md](docs/ZADANI-PRVNIHO-TASKU.md). Stav jednotlivých požadavků: [docs/FRONTEND-CHECKLIST.md](docs/FRONTEND-CHECKLIST.md). [docs/MIGRACE.md](docs/MIGRACE.md) je historický podklad z doby GPT Sites a zadání nepřebíjí.

## Spuštění

Node.js ≥ 22.22.1 a pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Aplikace běží na **http://localhost:3000/aplikace**, landing page na `http://localhost:3000/`. Vývojový server ukončíte pomocí Ctrl+C. V jedné složce může běžet jen jeden `pnpm dev`.

| Příkaz | Účel |
| --- | --- |
| `pnpm dev` | Vývojový server Next.js (Turbopack) |
| `pnpm build` | Produkční build Next.js, nic nepublikuje |
| `pnpm start` | Spuštění produkčního buildu (po `pnpm build`) |
| `pnpm exec tsc --noEmit --incremental false` | Kontrola TypeScriptu |
| `pnpm lint` | ESLint |
| `node --test tests/foundation.test.mjs tests/hub.test.mjs` | Demo úložiště, Resend adaptér a datová vrstva `lib/hub` (seed, perzistence, deduplikace, segmenty, scénáře, platby) |
| `pnpm test:e2e` | Playwright: smoke testy a porovnání se snímky proti běžící aplikaci, viz [e2e/README.md](e2e/README.md) |
| `pnpm test:e2e:reference` | Přepíše referenční snímky. Jen po schválené změně vzhledu. |
| `pnpm theme:css` | Znovu vygeneruje `app/theme-legacy.css` (převod původních stylů na tokeny světlého a tmavého tématu) |

Podrobnosti o lokálním vývoji, proměnných prostředí a původu exportu jsou v [README-LOCAL.md](README-LOCAL.md).

## Data

Data se ukládají jen v tomto prohlížeči (localStorage, klíč `softema-hub:data`) ve verzovaném a validovaném formátu. Přežijí obnovení stránky, ale jiní uživatelé ani jiné prohlížeče je nevidí. Ukázková data se vygenerují jen při prvním spuštění.

Návrat do výchozího stavu: **Nastavení → Data a obnova**. Obnovit jde jeden prostor nebo všechny, nejdřív můžete data exportovat do JSON.

Pracovní prostory jsou oddělené. Každý záznam patří k jednomu prostoru. Přepínač prostoru ale není oprávnění, oprávnění zajistí až server.

## Obrazovky

Celkem 10 obrazovek a sekcí:

- **Veřejný web:** landing page, `/funkce`, `/prihlaseni`, `/registrace`, `/obnova-hesla`. Formuláře jsou jen ukázka bez autentizace.
- **Přehled:** KPI, graf výkonu a zdroje nových kontaktů z uložených dat, nedávná aktivita.
- **Kontakty:**
  - seznam s filtry v URL a hromadnými akcemi,
  - detail s časovou osou ze všech modulů,
  - vlastní pole, souhlasy a GDPR export, anonymizace i výmaz,
  - segmenty s živými počty,
  - pipeline obchodů,
  - CSV import s mapováním a deduplikací.
- **Kampaně:**
  - průvodce (údaje → příjemci → obsah → kontrola) s automatickým ukládáním,
  - editor **Unlayer** s náhradním vestavěným editorem bloků,
  - simulované odeslání nebo naplánování a report.
- **Automatizace:**
  - builder na **React Flow** s větvením, validací a uložením,
  - spouštěče reagují na události z ostatních modulů,
  - simulovaný krok běhu.
- **Platby:** faktury, transakce, předplatné, platební odkazy a kupóny.
- **Kurzy a produkty:**
  - struktura kurz → moduly → lekce,
  - studenti z CRM,
  - náhled studenta s přehrávačem a postupným zpřístupněním,
  - digitální produkty.
- **Komunita:** skupiny, příspěvky, komentáře, moderace a náhled přístupu.
- **Webináře:**
  - živé a evergreen webináře,
  - registrační stránka s funkční registrací do CRM,
  - připomínky, účast a záznam,
  - pohled účastníka.
- **Chatbot:** vzhled, znalostní báze, chování, instalace a testovací chat se sběrem leadů do CRM.
- **Nastavení:** profil, prostor, branding a portál, tým a role, domény a odesílatelé, integrace (bez API klíčů), notifikace, data a obnova.

Moduly se přepínají fragmentem URL (`/aplikace#kontakty/1`). Filtry a kroky průvodců jsou také v URL, takže fungují přímé odkazy i tlačítka zpět a vpřed. Modul AI agentů je mimo rozsah zadání a je skrytý z navigace.

## Technologie

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui (Radix UI), Recharts, Lucide, Sonner, Zod, `react-email-editor` (Unlayer), `@xyflow/react` (React Flow), Playwright.

Cílová produkční architektura (NestJS, Prisma, PostgreSQL s RLS, Better-Auth, Redis/BullMQ, Docker/Hetzner) je popsaná v zadání a v [CLAUDE.md](CLAUDE.md).

**Unlayer** se načítá z `editor.unlayer.com` a běží bez účtu. Obsahuje proto branding Unlayer a nemá prémiové funkce. Volitelně jde nastavit veřejné `NEXT_PUBLIC_UNLAYER_PROJECT_ID` (není to secret). Když se skript nenačte, aplikace přepne na vestavěný editor.

## Nasazení ukázky na Vercel

Aplikace je čistě frontendová: všechny stránky se předrenderují staticky, data žijí v localStorage návštěvníka a nepotřebuje žádné proměnné prostředí, databázi ani API klíče. Na nové adrese (a v každém novém prohlížeči) se při prvním otevření vytvoří ukázková data.

Fungují dvě nastavení. **Výchozí (Root Directory `./`):** [vercel.json](vercel.json) v kořeni sestaví demo jako statický export (`NEXT_OUTPUT=export`) do `apps/web/out` a Vercel ho servíruje jako soubory. Demo je celé statické, takže se chová stejně. **Alternativa (Root Directory `apps/web`):** použije se [apps/web/vercel.json](apps/web/vercel.json) a Vercel nasadí Next.js normálně. Tabulka platí pro alternativu:

| Položka | Hodnota |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `./` (statický export), nebo `apps/web` se zapnutým „Include files outside the Root Directory“ |
| Install Command | `npx --yes pnpm@11.25.0 install --frozen-lockfile` (z `vercel.json`, nainstaluje celý workspace) |
| Build Command | `npx --yes pnpm@11.25.0 build` (z `vercel.json`, sestaví demo bez API) |
| Output Directory | výchozí (`.next` v `apps/web`) |
| Node.js Version | 22.x |
| Environment Variables | žádné. Volitelně veřejné `NEXT_PUBLIC_UNLAYER_PROJECT_ID`, až bude účet Unlayer. |

pnpm se instaluje v přesné verzi 11.25.0 přes `npx`, protože Vercel by jinak podle lockfilu zvolil starší pnpm, který nezná pravidla v `pnpm-workspace.yaml`. Instalace použije úložiště balíčků v `.sites-runtime/` uvnitř build adresáře (je v `.gitignore`).

Ukládání v prohlížeči se mezi počítači nesdílí. Data z jednoho prohlížeče přenesete exportem a importem v **Nastavení → Data a obnova**.

GitHub CI ([.github/workflows/verify.yml](.github/workflows/verify.yml)) ověřuje instalaci, typy, unit testy a build. Nic nenasazuje ani nerozesílá. Původní verze prototypu na Vinextu a Cloudflare Workers je uložená v lokální větvi `archive/sites-vinext`.
