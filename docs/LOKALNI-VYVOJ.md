# Spuštění databázové verze na novém počítači

Platí pro větev `feat/auth-contacts`. Vše běží jen lokálně, data jsou smyšlená a kdykoli je obnoví seed. Není potřeba žádná placená služba.

## 1. Co nainstalovat

| Nástroj | Verze | Odkud |
| --- | --- | --- |
| Git | aktuální | [git-scm.com](https://git-scm.com/downloads), na Macu nabídne instalaci příkaz `git --version` |
| Node.js | 22 LTS, aspoň 22.22.1 | [nodejs.org](https://nodejs.org/en/download) |
| pnpm | přesně 11.25.0 | `npm install -g pnpm@11.25.0` |
| Docker Desktop | aktuální | [docker.com](https://www.docker.com/products/docker-desktop/). Po instalaci ho spusťte a počkejte, až běží. |

Kontrola:

```sh
node -v && pnpm -v && docker compose version
```

## 2. Získání kódu

**Ze souboru zálohy** (`softema-hub.bundle`):

```sh
git clone -b feat/auth-contacts softema-hub.bundle softema-hub
cd softema-hub
git remote set-url origin https://github.com/Softema/softema-hub.git
```

**Z GitHubu** platí jen tehdy, pokud jste větev mezitím poslali na GitHub. Pozor na upozornění v části 7.

## 3. První spuštění

```sh
pnpm install --frozen-lockfile
pnpm setup:env      # vytvoří .env s náhodnými lokálními hesly a vypíše heslo testovacích uživatelů
pnpm db:up          # spustí PostgreSQL v Dockeru na 127.0.0.1:5433
pnpm db:setup       # migrace, databázové role, seed
pnpm dev:live       # API na :4100, web na :3000
```

Otevřete <http://localhost:3000/prihlaseni>. Heslo najdete v `.env` jako `SEED_USER_PASSWORD`.

**Stav ověření (5. 11. 2026):** `pnpm setup:env`, `pnpm db:up`, `pnpm db:setup`, `pnpm test:api` a `pnpm test:e2e:live` prošly v Dockeru s obrazem `pgvector/pgvector:pg17`. Engine zajišťovala Colima, Docker Desktop vyzkoušený není. Čistý klon ze zálohy prošel stejnými testy na PostgreSQL 17 mimo Docker. Po prvním spuštění na novém počítači proto pusťte i `pnpm test:api`.

## 4. Testovací uživatelé

| E-mail | Role | Prostor |
| --- | --- | --- |
| `spravce@softema-hub.example` | správce prostoru | Prostor Alfa |
| `clen@softema-hub.example` | člen, nesmí mazat | Prostor Alfa |
| `cizi@softema-hub.example` | správce prostoru | jen Prostor Beta |
| `agentura@softema-hub.example` | správce agentury | oba prostory |

## 5. Vyzkoušení sdílení mezi dvěma uživateli

1. V normálním okně se přihlaste jako `spravce@…` a vytvořte kontakt.
2. V anonymním okně se přihlaste jako `clen@…`. Kontakt vidíte, můžete ho upravit, přidat poznámku a štítek.
3. Vraťte se do prvního okna: po přepnutí na okno se data obnoví a změny tam jsou.
4. Členovi chybí tlačítko **Smazat kontakt**, správce ho má.
5. Otevřete u obou **Upravit kontakt**, u prvního uložte a u druhého také: druhý dostane upozornění na konflikt a nic se tiše nepřepíše.
6. Zkopírujte adresu kontaktu a otevřete ji jako `cizi@…`: uvidíte „Kontakt nenalezen“.

## 6. Běžné příkazy

| Příkaz | Co dělá |
| --- | --- |
| `pnpm dev` | jen demo s ukázkovými daty v prohlížeči, bez API a databáze |
| `pnpm dev:live` | databázová verze |
| `pnpm db:reset` | smaže lokální data a znovu vytvoří seed |
| `pnpm db:down` | zastaví PostgreSQL, data zůstanou |
| `docker compose down -v` | zastaví PostgreSQL a smaže i jeho data |
| `pnpm test:api` | integrační testy API a izolace, vlastní dočasná databáze |
| `pnpm test:e2e:live` | E2E databázové verze, vyžaduje `pnpm --filter @softema/web exec playwright install chromium` |
| `pnpm test` | unit testy |
| `pnpm build`, potom `pnpm start` | produkční sestavení dema |
| `pnpm check:separation` | po sestavení obou verzí ověří, že se navzájem neobsahují |

Pokud na portu 3000 něco běží, ukončete to, nebo změňte `WEB_ORIGIN` v `.env`. Přihlašování vyžaduje, aby tato adresa přesně odpovídala adrese v prohlížeči.

## 7. Než větev pošlete na GitHub nebo sloučíte

- **Push:** projekt je napojený na Vercel, který standardně staví preview z každé větve. Nejdřív v nastavení Vercelu ověřte, že push této větve nespustí nasazení (Settings → Git, Ignored Build Step).
- **Sloučení do `main`:** aplikace se přesunula do `apps/web`. Bez změny Root Directory ve Vercelu by se demo přestalo sestavovat.

## 8. Řešení problémů

| Příznak | Řešení |
| --- | --- |
| `pnpm db:up` hlásí chybu Dockeru | Docker Desktop neběží. Spusťte ho a počkejte. |
| Port 4100 je obsazený | Změňte `API_PORT` v `.env`. |
| Port 5433 je obsazený | Změňte `POSTGRES_PORT` a port v adresách `DATABASE_*_URL` v `.env`. |
| Přihlášení hlásí nedostupný server | Zkontrolujte, že běží `pnpm dev:live` a že `pnpm db:up` proběhl. |
| Heslo v `.env` nesedí s databází | `docker compose down -v`, potom znovu `pnpm db:up` a `pnpm db:setup`. |
