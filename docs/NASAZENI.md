# Nasazení databázové verze

Web na **Vercelu**, databáze na **Supabase** (jen hostovaný PostgreSQL), backend (API) na **VPS v Dockeru**. Veřejné demo zůstává beze změny ve svém vlastním projektu na Vercelu.

```
prohlížeč ──HTTPS──> Vercel (web, proxy.ts) ──HTTPS + tajný klíč──> VPS: Docker „api“ ──> Supabase (EU)
```

- Prohlížeč mluví jen s webem. `apps/web/proxy.ts` přeposílá `/api/*` na backend a přidá hlavičku `x-hub-proxy` s tajným klíčem `HUB_PROXY_SECRET`. Backend jiné požadavky odmítne (kromě `/api/health`), takže ho nejde volat přímo a obcházet limity přihlášení.
- Cookie přihlášení je na doméně webu. CORS není potřeba.
- Tajné hodnoty jsou jen v `deploy/.env` na serveru a v proměnných projektu na Vercelu, nikdy v Gitu.

**Stav:** prototyp. Chybí CSP, správa přihlášených zařízení a ověřené zálohy (Free plán Supabase zálohy nedělá). Zatím jen pro interní tým a smyšlené kontakty.

## 1. Supabase

1. Nový projekt v regionu EU (projekt `icrvwqqpbdfqkjeeumfi` je v **eu-west-1, Irsko**). Data API **vypnout**, „Automatically expose new tables“ **vypnout**, „automatic RLS“ **zapnout**.
2. Heslo databáze uložit do správce hesel.
3. **Connect → Session pooler** (IPv4, port 5432): z adresy vzít hostitele (`aws-…-eu-central-1.pooler.supabase.com`) a `project-ref`.

Migrace vytvoří schéma `hub`, role `hub_app` a `hub_auth` s RLS, rozšíření `unaccent` a `pg_trgm` ve schématu `extensions`. Do schématu `public` jde jen tabulka historie migrací Prismy. Data API je vypnuté a tabulka má RLS.

## 2. VPS (Ubuntu 24.04 s Dockerem)

```sh
sudo git clone https://github.com/Softema/softema-hub.git /opt/softema-hub
cd /opt/softema-hub/deploy
sudo cp .env.example .env && sudo chmod 600 .env
sudo nano .env                      # vyplnit podle komentářů v souboru
sudo curl -fsS -o supabase-ca.crt https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt   # certifikát Supabase pro ověřené TLS
openssl rand -hex 32                # pro BETTER_AUTH_SECRET a HUB_PROXY_SECRET (každý zvlášť), hesla rolí
sudo docker compose build
sudo docker compose run --rm --workdir /app api pnpm --filter @softema/db run deploy   # migrace + hesla rolí
sudo docker compose up -d
curl -s http://127.0.0.1:4100/api/health   # {"status":"ok"}
```

`deploy` spouští jen migrace a role. **Seed se smyšlenými účty online nikdy nespouštějte** (`db:setup`, `db:seed`).

### HTTPS pro backend

Na serveru už běží **Traefik** (síť `root_default`, certifikáty přes resolver `mytlschallenge`) pro n8n. `deploy/compose.yml` připojí backend do stejné sítě a Traefik ho vystaví na adrese `API_HOSTNAME` s certifikátem Let's Encrypt. Nastavení Traefiku ani n8n se nemění. Hostinger směruje na VPS každou subdoménu `srv1083481.hstgr.cloud`, takže dokud není vlastní doména, backend běží na **`https://hub-api.srv1083481.hstgr.cloud`**. Po koupi domény se jen změní `API_HOSTNAME`.

## 3. Vercel (nový projekt, demo zůstává)

1. **Add New → Project**, stejný repozitář `Softema/softema-hub`.
2. **Root Directory:** `apps/web`. Nastavení buildu vezme z `apps/web/vercel.json`, Node 24 z `engines`.
3. **Environment Variables** (Production):

| Proměnná | Hodnota |
| --- | --- |
| `NEXT_PUBLIC_APP_MODE` | `live` |
| `API_INTERNAL_URL` | `https://hub-api.srv1083481.hstgr.cloud` |
| `HUB_PROXY_SECRET` | stejná hodnota jako v `deploy/.env` |

4. Po prvním nasazení zapsat adresu webu (`https://<projekt>.vercel.app`) do `WEB_ORIGIN` v `deploy/.env` a backend restartovat: `sudo docker compose up -d`.

## 4. První účet

Registrace je vypnutá, účty vznikají jen pozvánkou. První správkyně:

```sh
cd /opt/softema-hub/deploy
sudo docker compose run --rm --workdir /app -e BOOTSTRAP_EMAIL=jmeno@firma.cz api pnpm --filter @softema/db run bootstrap
```

Vypíše jednorázový odkaz `…/pozvanka#…`. Otevřete ho, zvolte jméno a heslo a zapněte dvoufázové ověření. Pak příkaz spusťte **znovu**, aby se z účtu stal správce agentury. Další lidi už zvete v aplikaci (Tým → Pozvat člena).

## 5. E-maily (Resend)

`MAIL_PROVIDER=resend`, `RESEND_API_KEY` a `MAIL_FROM` v `deploy/.env`. **Bez ověřené domény Resend doručí jen na e-mail svého účtu** (odesílatel `onboarding@resend.dev`). Pozvánky a obnova hesla pro ostatní tedy čekají na doménu. Pak se v Resend přidá doména a DNS záznamy a `MAIL_FROM` se změní na adresu z ní.

## 6. Aktualizace

```sh
cd /opt/softema-hub && sudo git pull
cd deploy && sudo docker compose build
sudo docker compose run --rm --workdir /app api pnpm --filter @softema/db run deploy
sudo docker compose up -d
```

Web na Vercelu se nasadí sám po pushi na `main`.
