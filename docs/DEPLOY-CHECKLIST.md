# Deploy checklist: Softema Hub (databázová verze)

Podle interního standardu Softema „Jednotný stack pro nové aplikace“ (v2.1, 22. 10. 2026, str. 7). Položku odškrtáváme až po ověření, nerelevantní označujeme N/A s důvodem. Stav k **18. 11. 2026**.

✅ ověřeno · ⚠️ částečně / čeká na ověření · ❌ chybí · N/A nerelevantní

## Varianta a odchylky od standardu

- **Varianta B (Vercel + VPS backend)**, databáze Supabase Cloud (eu-west-1). Web: Vercel projekt `softema-hub`. API: Docker na VPS Hostinger. Postup je v [NASAZENI.md](NASAZENI.md).
- **Přihlášení není Supabase Auth**, ale Better-Auth v NestJS backendu. Je to závazné zadání ([ZADANI-APLIKACE.md](ZADANI-APLIKACE.md)) a standard existující projekty kvůli sjednocení nepřepisuje. Supabase slouží jen jako PostgreSQL, Data API je vypnuté.
- **Bez Cloudflare Tunnelu.** VPS už provozuje Traefik pro n8n (porty 80/443 otevřené). API je za Traefikem s Let's Encrypt a odpovídá jen požadavkům s tajným klíčem z Vercel proxy (kromě `/api/health`). Tunnel standard doporučuje pro *nový* VPS.

## Checklist

| # | Položka | Stav | Doklad / co chybí |
| --- | --- | --- | --- |
| 1 | Varianta, provoz DB, správce, tarif | ⚠️ | Varianta B, Supabase Cloud (Free). Vercel tým je na tarifu **Pro** (ověřeno 18. 11.). **Chybí určený správce.** |
| 2 | Oddělená data, URL a klíče pro produkci a testy | ✅ | Proměnné `HUB_PROXY_SECRET`, `API_INTERNAL_URL` a `NEXT_PUBLIC_APP_MODE` jsou na Vercelu jen pro *Production* (ověřeno 18. 11.), preview nasazení s produkčním API nemluví. Lokální vývoj i CI mají vlastní DB, role a klíče. |
| 3 | Tajné klíče mimo Git, klienta a logy; správci mají MFA | ⚠️ | Secrets jen v `deploy/.env` na serveru a v proměnných Vercelu (ne `NEXT_PUBLIC_`). **Gitleaks v CI** prochází celou historii. 9 nálezů jsou smyšlené testovací hodnoty, prověřené v `.gitleaksignore`. Aplikace vynucuje 2FA správcům prostoru. **Účet na Vercelu nemá 2FA. GitHub, Supabase, Hostinger a Resend neověřené.** |
| 4 | RLS a Storage ověřené dvěma uživateli | ✅ | RLS (u dat prostorů vynucené) a testy dvou prostorů: `apps/api/test/rls.test.ts`, `api.test.ts`. CI hlídá, že každá tabulka s `workspace_id` má RLS. Storage N/A (žádné soubory). |
| 5 | Login, odhlášení, reset hesla, povolené návratové adresy | ✅ | `e2e-live/live.spec.ts`, `account.test.ts`. `trustedOrigins` a odkazy v e-mailech jen na `WEB_ORIGIN`, kontrola Origin na zápisech. Registrace vypnutá, účty jen pozvánkou. |
| 6 | Hlavní scénář, formuláře, soubory, mobil | ✅ | E2E: kontakty, tým, pozvánka, zabezpečení. Mobil ručně. Soubory N/A. |
| 7 | CI prošlo; plán migrace a návratu | ✅ | CI: typy, unit testy, build, audit závislostí, API + RLS testy, Gitleaks. Migrace jen `prisma migrate deploy`, aditivní. Před rizikovou migrací ruční záloha `deploy/backup.sh`. |
| 8 | HTTPS a DNS; režim Cloudflare | ✅ | HTTPS všude (HSTS na webu, TLS `verify-full` k DB). Vlastní doména zatím není. Cloudflare N/A. |
| 9 | Privátní data mimo sdílenou cache; limity, AI rozpočet | ✅ | API posílá `Cache-Control: no-store` (test v `proxy.test.ts`, ověřeno na serveru). Limity přihlášení, resetu a 2FA podle IP, zámek účtu po 5 pokusech. AI rozpočet N/A (AI mimo rozsah). |
| 10 | Záloha DB i souborů, ověřená obnova | ✅ | `deploy/backup.sh` denně ve 2:30 UTC na VPS (mimo Supabase), 14 dní. Při selhání e-mail na `ALERT_EMAIL`. **Test obnovy 18. 11. prošel**: `deploy/restore-check.sh`, 17 tabulek, počty řádků shodné s produkcí. Soubory N/A. Zálohy leží na jednom serveru: při jeho ztrátě zůstanou data v Supabase, ale bez historie. |
| 11 | Monitoring s upozorněním; funkční test po vydání | ✅ | `.github/workflows/monitor.yml` každých 15 min: web → API → DB (`/api/health` vrací 503 bez DB), hlavičky, ochrana backendu, certifikáty. Selhání GitHub pošle e-mailem. Po vydání ověřeno: health, `no-store`, 401 na špatné heslo, CSP/HSTS. |
| 12 | VPS: data přežijí restart; Tunnel | ✅ / N/A | API je bezstavové (data v Supabase), `restart: unless-stopped`, po nasazení 18. 11. naběhlo samo. Tunnel N/A, viz odchylky. Správa přes SSH klíčem. |

## Kontrola kritických změn (str. 3)

Přihlášení, 2FA, role, pozvánky, RLS a nasazení vznikly s AI. **Standard vyžaduje kontrolu backenďákem**, ta zatím neproběhla. Podklady: [ARCHITECTURE.md](ARCHITECTURE.md), migrace v `packages/db/prisma/migrations/`, testy v `apps/api/test/`.

**Security Advisor:** dashboard Supabase zatím nikdo neprošel. Jeho hlavní kontroly proběhly SQL dotazem nad produkcí 18. 11.:
- žádná tabulka v `public` bez RLS,
- žádné pohledy ani rozšíření v `public`,
- všechny SECURITY DEFINER funkce mají pevnou `search_path`,
- role `anon`/`authenticated`/`service_role` nemají do schématu `hub` přístup.

**Vědomě přijaté varování:** `hub.current_user_id()` a `hub.current_workspace_id()` nemají pevnou `search_path` (Advisor: *function_search_path_mutable*). Volají jen vestavěné `current_setting`/`nullif` a nejsou SECURITY DEFINER. S `SET search_path` by je PostgreSQL v politikách RLS nemohl inlinovat a každý dotaz by zpomalil.

## Mimo rozsah (N/A)

Webhooky (žádné příchozí), nahrávání souborů, stahování cizích URL a AI funkce aplikace zatím nemá. Při jejich přidání platí body 03/04 a 01 provozu ze standardu.
