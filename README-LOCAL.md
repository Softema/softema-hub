# Softema Hub — lokální vývoj ve VS Code

Tento export obsahuje skutečné zdroje publikované verze **3** projektu Softema Hub.

- Úplný zdrojový commit: `b813fd42bca07dcf1b3da30a17e87c8fce3c96cb`.
- Projekt Sites: `appgprj_6ab63c04fb6c81919d791506efe2d063`.
- Vazba verze 3 na tento commit byla ověřena v metadatech Sites dne 13. 10. 2026.
- Zdroje byly získány přímo z Git objektu tohoto commitu, nikoli kopírováním rozpracovaného pracovního adresáře nebo stahováním publikovaného webu.
- Aplikační kód, design, mock data, interakce, konfigurace a uzamčené závislosti zůstaly beze změny. Rozpracovaná tvorba kampaní přes AI brief není součástí exportu. Neproběhl převod na Next.js ani změna hostingu.

## Požadavky

- **Node.js 22.13.0 nebo novější** podle `package.json`. Tento export byl ověřen na Linuxu s Node.js **24.19.0**.
- **pnpm 11.25.0**, přesně verze uvedená v `packageManager`.
- VS Code a terminál s dostupným `node` a `npx` (součást instalace Node.js).
- Pro první instalaci je potřeba přístup k npm registru, pokud potřebné balíčky již nejsou v lokální cache. `node_modules` se v ZIPu nenachází.

Používejte dodaný `pnpm-lock.yaml` a příznak `--frozen-lockfile`. Není potřeba měnit správce balíčků, aktualizovat závislosti ani instalovat Next.js zvlášť.

## Otevření a instalace

Rozbalte ZIP a ve VS Code otevřete jeho složku `softema-hub`, tedy adresář obsahující `package.json` a tento README. Příkazy dále spouštějte v terminálu této složky.

```sh
node --version
npx --yes pnpm@11.25.0 --version
npx --yes pnpm@11.25.0 install --frozen-lockfile
```

Pokud máte `pnpm` již nainstalovaný ve verzi 11.25.0, můžete ve všech příkazech nahradit `npx --yes pnpm@11.25.0` prostým `pnpm`.

## Spuštění vývoje

```sh
npx --yes pnpm@11.25.0 dev
```

Otevřete adresu vypsanou v terminálu; standardně `http://localhost:5173`. Při obsazeném portu se řiďte skutečným výpisem. Vývojový server ukončíte pomocí Ctrl+C.

| Adresa | Obsah |
| --- | --- |
| `/` | Landing page |
| `/funkce` | Přehled funkcí |
| `/prihlaseni` | Ukázkové přihlášení |
| `/registrace` | Ukázková registrace |
| `/obnova-hesla` | Ukázková obnova hesla |
| `/aplikace` | Aplikace Softema Hub |
| `/aplikace#kampane` | Kampaně a původní e-mailový editor |
| `/aplikace#automatizace` | Vizuální workflow builder |
| `/aplikace#ai-agenti` | Ukázkový modul AI agentů |

## TypeScript a build

Kontrola typů bez vytváření souborů a inkrementální cache:

```sh
npx --yes pnpm@11.25.0 exec tsc --noEmit --incremental false
```

Produkční build:

```sh
npx --yes pnpm@11.25.0 build
```

Build nic nepublikuje ani neaplikuje databázové migrace. Vytváří výstup do `dist/`, včetně serverového výstupu pro Cloudflare Workers. Nejde o samostatný statický web určený k otevření přes `file://` ani o hotový Vercel balík.

Projekt obsahuje také původní příkaz `pnpm start` pro lokální Wrangler nad již vytvořeným Workers buildem. V rámci tohoto exportu nebyl tento příkaz ověřen; pro běžný vývoj používejte `pnpm dev`.

## Proměnné prostředí

**Pro současný mock frontend není nutná žádná vlastní proměnná prostředí.** `.env.local` nevytvářejte kvůli pouhému spuštění ukázky. Export obsahuje původní `.env.example` beze změn; nejsou v něm skutečné klíče ani tokeny.

| Proměnné v `.env.example` | Význam a skutečné použití ve verzi 3 |
| --- | --- |
| `APP_MODE`, `EMAIL_PROVIDER`, `EMAIL_SENDING_ENABLED`, `PUBLIC_SIGNUP_ENABLED` | Návrh budoucího řízení režimu aplikace. Ukázkové hodnoty jsou `demo`, `resend`, `false`, `false`; aktuální UI je těmito proměnnými neřízené. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Prázdná příprava budoucího Supabase klienta. Současná aplikace je nepoužívá. |
| `SUPABASE_SECRET_KEY` | Prázdná příprava serverového přístupu; nyní nepoužito. |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SIGNING_SECRET` | Prázdná příprava budoucí rozesílky a webhooků. Adaptér není napojen na aplikaci ani automaticky na tyto proměnné. |
| `AI_CREDENTIAL_ENCRYPTION_KEY`, `AI_CREDENTIAL_KEY_VERSION`, `AUTOMATION_WEBHOOK_SIGNING_SECRET` | Příprava serverového ukládání přístupů a automatizací; skutečné šifrování a běhové služby nejsou implementované. Verze klíče má bezpečnou ukázkovou hodnotu `1`. |
| `APP_ORIGIN` | Prázdná příprava budoucích přesměrování a odhlašovacích odkazů. |

Pouhé doplnění hodnot do `.env.local` žádnou z budoucích integrací nezapojí. Pro zkoušení současného UI nevkládejte skutečné API tokeny. Vývojové nástroje si v konfiguraci samy nastavují pomocné ne-tajné hodnoty pro lokální Cloudflare runtime; nemusíte je vyplňovat.

## Co aplikace skutečně používá

| Oblast | Stav publikované verze 3 |
| --- | --- |
| Frontend | React 19.2.6, TypeScript 5.9.3, Vinext 1.0.0-beta.5 / Vite 8.0.13. Tailwind CSS 4.2.1, vlastní CSS, komponenty shadcn/ui a Radix UI. Závislost Next.js 16.3.4 je zachována, běžné příkazy ale používají Vinext/Vite. |
| Navigace | Souborové veřejné routy v `app/`; uvnitř Hubu vlastní navigace přes fragment URL a React Context. |
| Kontakty, kampaně a další moduly | Ukázkové záznamy a stav v paměti prohlížeče. Obnovení stránky data resetuje. Některé moduly mohou lokální stav ztratit i při opuštění obrazovky. |
| E-mailový editor a workflow builder | Vlastní React implementace v `app/campaigns.tsx` a `app/automations.tsx`. Úpravy a interakce jsou zachovány. Přepnutí stavu nebo naplánování představuje ukázkové chování. |
| Přihlášení, registrace, obnova hesla | Formuláře a simulované přechody; nejde o skutečné uživatelské účty ani ověřování identity. |
| AI agenti a chatbot | Ukázková připojení, simulované běhy a připravené odpovědi. Modelová API ani skutečný plánovač nejsou připojené. |
| Rozesílka, platby | Simulované interakce; aplikace neposílá e-maily a neprovádí platby. |
| Supabase | SQL návrhy v `supabase/migrations/` a návrh testu izolace v `supabase/tests/`. Nejsou aplikované, nebyly v tomto ověření spuštěny a aplikace nepoužívá Supabase SDK. |
| Resend | Připravený serverový adaptér `lib/server/email/resend.ts`. Žádná současná obrazovka ani route ho nevolá. Není aktivovaný. |
| Databáze / úložiště | Drizzle/D1 helper zůstává v projektu, `db/schema.ts` je prázdné. D1 i R2 v `.openai/hosting.json` jsou `null`. Běžící produktová databáze není součástí prototypu. |

Podrobnosti budoucí migrace jsou v `docs/MIGRACE.md`. Jde o přípravu dalšího vývoje, nikoli o funkce aktivované tímto exportem.

## Omezení lokálního běhu

- Používá se lokální vývojový server Vinext a Cloudflare runtime. Není potřeba účet Cloudflare, Supabase ani Resend pro spuštění mock UI.
- Export nemá strojově specifický `.sites-runtime/execution-profile.json`; dodaný `scripts/execution-profile.mjs` proto automaticky zvolí původní režim `portable`. Konfiguraci kvůli tomu neupravujte.
- Ponechte `build/sites-vite-plugin.ts`, `vendor/` a `.openai/hosting.json`: jsou to součásti zdrojů potřebné pro současný build. Složka `build/` obsahuje zdrojový plugin, není to hotový build výstup. Identifikátor projektu v hostingovém manifestu není přístupový token.
- Běžné příkazy výše používají Node.js. Původní pomocné skripty `install:ci` a `scripts/*.sh` pro spravované prostředí vyžadují Bash a některé Linuxové nástroje; nejsou potřeba pro uvedený postup lokální instalace.
- Obrázky vložené do e-mailového editoru jsou pouze lokální objektové URL, ne uploady do trvalého úložiště. WebMCP funguje jen v prohlížeči, který poskytuje `document.modelContext`.
- Nativní balíčky, například `workerd`, se instalují podle platformy. Ověření v tomto exportu proběhlo pouze na Linuxu, nikoli na Windows nebo macOS.

## Ověření exportu dne 13. 10. 2026

Testy proběhly v nové kopii získané z uvedeného commitu, bez přenesených `node_modules`, bez `.env.local` a s výchozím režimem `portable`. Původní pracovní adresář zůstal beze změny.

| Kontrola | Výsledek |
| --- | --- |
| Instalace uzamčených závislostí | **PROŠLA**, pnpm 11.25.0; 628 balíčků z dostupné pnpm cache, bez stažení nových balíčků. |
| TypeScript: `pnpm exec tsc --noEmit --incremental false` | **PROŠEL**, návratový kód 0. |
| Build: `pnpm build` | **PROŠEL**, návratový kód 0; vytvořen client, RSC a SSR/Workers výstup. |
| Shoda exportovaných původních souborů s commitem | **OVĚŘENA** po instalaci i buildu; bez změn obsahu. |
| Stažení všech závislostí na zařízení bez cache | **NEOVĚŘENO**; instalace zde využila existující cache. Bootstrap pnpm přes `npx` nebyl potřeba, byl použit již dostupný pnpm 11.25.0. |
| Spuštění `dev` / `start` a klikací kontrola v prohlížeči | **V TOMTO EXPORTU NEOVĚŘENO**. Výsledky historického QA v původním README nejsou novým ověřením lokálního běhu. |
| Supabase, Resend, autentizace, skutečné AI API | **NEAKTIVOVÁNO A NETESTOVÁNO**; zůstávají přípravou nebo simulací. |

Při ověření byl použit Node.js 24.19.0 a pnpm 11.25.0. Přesný instalační příkaz v prostředí odpovídal `pnpm install --frozen-lockfile --prefer-offline --fetch-retries=0 --fetch-timeout=30000`; poslední tři parametry řídí pouze využití cache a síťové pokusy. Pro běžnou instalaci použijte výše uvedený příkaz bez nich.

Build vypsal nezastavující upozornění na JavaScript chunky nad 500 kB a neúplnou statickou klasifikaci rout ve Vinextu. Výstup byl přesto úspěšně dokončen. Kvůli zachování přesné verze se kód ani konfigurace neoptimalizovaly.

## Obsah a původ ZIPu

ZIP obsahuje **137 původních souborů** commitu a dvě doplněné položky: tento `README-LOCAL.md` a `SOURCE-MANIFEST.sha256`. Manifest uvádí SHA-256 všech původních exportovaných souborů pro kontrolu jejich obsahu.

Jsou zachovány `app/`, `components/`, `hooks/`, `lib/`, styly, veřejné assety, `vendor/`, konfigurace, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, potřebné pomocné skripty, příprava databáze a původní dokumentace.

Nejsou zahrnuty `.git`, `node_modules`, vytvořený `dist/`, cache, lokální konfigurace běhového prostředí ani soubory se skutečnými secrets. Jediný vynechaný soubor sledovaný v původním commitu je `tsconfig.tsbuildinfo`, protože jde o vygenerovanou TypeScript cache. `.env.example` obsahuje jen původní bezpečné ukázkové a prázdné hodnoty.

Publikovaný web nebyl upraven ani znovu nasazen. V ZIPu není rozpracovaná tvorba kampaní přes AI brief a nejsou aktivované žádné externí integrace.
