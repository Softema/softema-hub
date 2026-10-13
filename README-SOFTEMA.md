# Softema Hub

Český agenturní marketingový hub. Tento projekt je interaktivní demo: landing page, ukázkové přihlášení a registrace, CRM, kampaně, automatizace, AI agenti, platby, kurzy, webináře a chatbot.

## Lokální spuštění

Node.js 22.13+ a pnpm 11.25.0. Otevřete tuto složku v Antigravity nebo jiném IDE.

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx --yes pnpm@11.25.0 dev
```

Otevřete adresu, kterou vypíše terminál. Landing page je `/`, aplikace `/aplikace`, AI modul `/aplikace#ai-agenti`. Vývojový proces ukončíte Ctrl+C.

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test tests/foundation.test.mjs
npx --yes pnpm@11.25.0 build
```

## Další vývoj

Hlavní dokument: [Příprava migrace](docs/MIGRACE.md).

- Cílová databáze a identita: Supabase.
- Budoucí hosting: Cloudflare Workers nebo Vercel; zatím beze změny hostingu.
- Rozesílka: Resend. Serverový adaptér je připraven, ale není nikde zapojený ani povolený.
- Data patří organizaci a klientskému prostoru. AI cache, CRM a kampaně používají stabilní ID prostorů.
- Skutečné API tokeny sem nevkládejte při zkoušení UI. Prázdné serverové proměnné jsou v `.env.example`.
- Změny v aplikaci jsou jen v paměti a po obnovení stránky se smažou.
- SQL a test izolace jsou připravené pro budoucí testovací Supabase projekt. Migrace se při frontendovém buildu automaticky nespouštějí.

Projekt zatím používá Vinext/Vite a výstup pro Cloudflare Workers. Přímý deploy na Vercel ještě vyžaduje přizpůsobení build konfigurace. Připravené GitHub CI pouze ověřuje kód, nikam nenasazuje a nic nerozesílá.
