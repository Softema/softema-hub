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

Docker potřebuje zapnutou virtualizaci procesoru v BIOSu (u AMD „SVM Mode“, u Intelu „Intel VT-x“). Pokud ji zapnout nemůžete nebo nechcete, použijte místo Dockeru PostgreSQL nainstalovaný přímo v systému, viz [část 3b](#3b-postgresql-bez-dockeru).

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

Otevřete <http://localhost:3000/prihlaseni>. Heslo najdete v `.env` jako `SEED_USER_PASSWORD`. Správci se přihlašují i kódem z aplikace (2FA), aktuální kód vypíše `pnpm totp`.

**Stav ověření (5. 11. 2026):** `pnpm setup:env`, `pnpm db:up`, `pnpm db:setup`, `pnpm test:api` a `pnpm test:e2e:live` prošly v Dockeru s obrazem `pgvector/pgvector:pg17`. Engine zajišťovala Colima, Docker Desktop vyzkoušený není. Čistý klon ze zálohy prošel stejnými testy na PostgreSQL 17 mimo Docker. Po prvním spuštění na novém počítači proto pusťte i `pnpm test:api`.

## 3b. PostgreSQL bez Dockeru

Pro počítače, kde Docker neběží (typicky kvůli vypnuté virtualizaci). Nastavení je stejné jako v Dockeru: port 5433, databáze `softema_hub` a vlastník `softema_owner` s heslem `POSTGRES_PASSWORD` z `.env`. Soubor `.env` proto zůstává beze změny.

**Windows** (PowerShell v kořeni projektu, po `pnpm setup:env`). Instalace si vyžádá potvrzení správce:

```powershell
$pw = ((Get-Content .env | Where-Object { $_ -match '^POSTGRES_PASSWORD=' }) -split '=',2)[1]
winget install --id PostgreSQL.PostgreSQL.17 -e --silent --accept-package-agreements --accept-source-agreements `
  --override "--mode unattended --unattendedmodeui none --superpassword $pw --serverport 5433 --disable-components pgAdmin,stackbuilder"

$env:PGPASSWORD = $pw
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -d postgres -v ON_ERROR_STOP=1 `
  -c "create role softema_owner login superuser password '$pw';" `
  -c "create database softema_hub owner softema_owner encoding 'UTF8' template template0;"
```

PostgreSQL pak běží jako služba Windows `postgresql-x64-17` a spouští se sám se systémem. Dál pokračujte jako v části 3, jen **bez `pnpm db:up`**:

```sh
pnpm db:setup
pnpm test:api
pnpm dev:live
```

**macOS / Linux:** nainstalujte PostgreSQL 17 (`brew install postgresql@17`, nebo balíček distribuce) s portem 5433 a vytvořte stejnou roli a databázi příkazem `psql` výše.

Rozdíly proti Dockeru:

- `pnpm db:up`, `pnpm db:down` a `docker compose down -v` tu nefungují. Databáze běží pořád. Ostatní příkazy (`db:setup`, `db:reset`, `test:api`, `dev:live`) fungují beze změny.
- Chybí rozšíření `pgvector`. Současné migrace ho nepotřebují, bude potřeba až pro chatbota.
- Pokud později přejdete na Docker, zastavte nejdřív službu (`Stop-Service postgresql-x64-17` v PowerShellu jako správce), jinak obě databáze chtějí port 5433.

**Stav ověření (10. 11. 2026):** Windows 11, PostgreSQL 17.11 z wingetu. `pnpm db:setup`, `pnpm test:api` (44/44) a `pnpm test:e2e:live` (21 prošlo, 1 záměrně přeskočený na mobilu) prošly.

## 4. Testovací uživatelé

| E-mail | Role | Prostor | 2FA |
| --- | --- | --- | --- |
| `spravce@softema-hub.example` | správce prostoru | Prostor Alfa | ano |
| `clen@softema-hub.example` | člen, nesmí mazat ani spravovat tým | Prostor Alfa | ne |
| `cizi@softema-hub.example` | správce prostoru | jen Prostor Beta | ano |
| `agentura@softema-hub.example` | správce agentury | oba prostory | ano |

Všichni mají heslo `SEED_USER_PASSWORD` z `.env`. Správci mají dvoufázové ověření povinné. Seed jim ho nastaví se společným klíčem odvozeným z hesla, takže stačí:

```sh
pnpm totp    # vypíše aktuální šestimístný kód a klíč pro autentizační aplikaci
```

Klíč si můžete přidat i do autentizační aplikace v telefonu (Google Authenticator a podobně). Platí jen pro tyto smyšlené účty.

## 5. Vyzkoušení sdílení mezi dvěma uživateli

1. V normálním okně se přihlaste jako `spravce@…` a vytvořte kontakt.
2. V anonymním okně se přihlaste jako `clen@…`. Kontakt vidíte, můžete ho upravit, přidat poznámku a štítek.
3. Vraťte se do prvního okna: po přepnutí na okno se data obnoví a změny tam jsou.
4. Členovi chybí tlačítko **Smazat kontakt**, správce ho má.
5. Otevřete u obou **Upravit kontakt**, u prvního uložte a u druhého také: druhý dostane upozornění na konflikt a nic se tiše nepřepíše.
6. Zkopírujte adresu kontaktu a otevřete ji jako `cizi@…`: uvidíte „Kontakt nenalezen“.

## 5b. Vyzkoušení účtů a týmu

E-maily se lokálně **neodesílají**. API je ukládá jako HTML soubory do složky `.outbox/` v kořeni projektu. Otevřete nejnovější soubor v prohlížeči a klikněte na odkaz.

1. **Pozvánka:** jako `spravce@…` otevřete **Tým → Pozvat člena**, zadejte smyšlený e-mail (např. `nova@test-firma.example`) a roli.
2. Otevřete odkaz z `.outbox/` v anonymním okně, vyplňte jméno a heslo (aspoň 12 znaků).
3. Pokud jste zvolili roli **Správce prostoru**, aplikace vás nepustí dál, dokud nezapnete dvoufázové ověření. K tomu potřebujete autentizační aplikaci v telefonu. Člen se dostane rovnou ke kontaktům.
4. Ve **Tým** u správce změňte roli nebo člena odeberte. Odebraný po obnovení stránky ztratí přístup.
5. **Zapomenuté heslo:** na přihlášení klikněte na **Zapomněli jste heslo?**, zadejte e-mail a otevřete odkaz z `.outbox/`. Odkaz platí hodinu a jen jednou. Pokud měníte heslo testovacího účtu, `pnpm db:seed` ho vrátí na `SEED_USER_PASSWORD`.
6. **Zabezpečení účtu** (menu profilu): změna hesla, nové záložní kódy, u člena zapnutí a vypnutí 2FA.

## 6. Běžné příkazy

| Příkaz | Co dělá |
| --- | --- |
| `pnpm dev` | jen demo s ukázkovými daty v prohlížeči, bez API a databáze |
| `pnpm dev:live` | databázová verze |
| `pnpm db:reset` | smaže lokální data a znovu vytvoří seed |
| `pnpm db:seed` | vrátí testovacím účtům heslo a 2FA ze seedu, data ponechá |
| `pnpm totp` | aktuální ověřovací kód testovacích správců |
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
| Docker hlásí „Virtualization support not detected“ nebo chybu WSL | Zapněte virtualizaci v BIOSu (SVM Mode / Intel VT-x), nebo použijte [PostgreSQL bez Dockeru](#3b-postgresql-bez-dockeru). |
| Heslo v `.env` nesedí s databází (bez Dockeru) | V `psql` jako `postgres` spusťte `alter role softema_owner password '<POSTGRES_PASSWORD z .env>';`, potom `pnpm db:setup`. |
| Port 4100 je obsazený | Změňte `API_PORT` v `.env`. |
| Port 5433 je obsazený | Změňte `POSTGRES_PORT` a port v adresách `DATABASE_*_URL` v `.env`. |
| Přihlášení hlásí nedostupný server | Zkontrolujte, že běží `pnpm dev:live` a že `pnpm db:up` proběhl. |
| Heslo v `.env` nesedí s databází | `docker compose down -v`, potom znovu `pnpm db:up` a `pnpm db:setup`. |
| Kód 2FA testovacího správce nesedí | Zkontrolujte čas v počítači (kód platí 30 s). Po 5 chybných kódech je ověření 15 minut zamčené, `pnpm db:seed` zámek zruší. |
| Odkaz z e-mailu nikam nevede | E-maily nejsou ve schránce, ale ve složce `.outbox/`. Odkaz musí obsahovat i část za `#`. |
