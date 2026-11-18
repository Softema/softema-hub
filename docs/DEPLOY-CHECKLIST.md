# Deploy checklist: Softema Hub (databázová verze)

Podle interního standardu Softema „Jednotný stack pro nové aplikace“ (v2.1, 22. 10. 2026, str. 7). Položku odškrtáváme až po ověření, nerelevantní označujeme N/A s důvodem. Stav k **18. 11. 2026**, commit `5bf0fdf` na `main`.

✅ ověřeno · ⚠️ částečně / čeká na ověření · ❌ chybí · N/A nerelevantní

## Varianta a odchylky od standardu

- **Varianta B (Vercel + VPS backend)**, databáze Supabase Cloud (eu-west-1). Web: Vercel projekt `softema-hub`. API: Docker na VPS Hostinger. Postup je v [NASAZENI.md](NASAZENI.md).
- **Přihlášení není Supabase Auth**, ale Better-Auth v NestJS backendu. Je to závazné zadání ([ZADANI-APLIKACE.md](ZADANI-APLIKACE.md)) a standard existující projekty kvůli sjednocení nepřepisuje. Supabase slouží jen jako PostgreSQL, Data API je vypnuté.
- **Bez Cloudflare Tunnelu.** VPS už provozuje Traefik pro n8n (porty 80/443 otevřené). API je za Traefikem s Let's Encrypt a odpovídá jen požadavkům s tajným klíčem z Vercel proxy (kromě `/api/health`). Tunnel standard doporučuje pro *nový* VPS.

## Checklist

| # | Položka | Stav | Doklad / co chybí |
| --- | --- | --- | --- |
| 1 | Varianta, provoz DB, správce, tarif | ❌ | Varianta B, Supabase Cloud. **Chybí určený správce.** **Vercel Hobby nesmí na komerční použití**, potřeba Pro. Supabase Free nemá zálohy. |
| 2 | Oddělená data, URL a klíče pro produkci a testy | ⚠️ | Lokální vývoj i CI mají vlastní DB, role a klíče (`.env`, CI jen `ci-only` hodnoty). Produkční proměnné na Vercelu mají být jen pro *Production*, aby preview nasazení nemluvilo s produkčním API. **Ověřit ve Vercelu.** |
| 3 | Tajné klíče mimo Git, klienta a logy; správci mají MFA | ⚠️ | Secrets jen v `deploy/.env` na serveru a v proměnných Vercelu (ne `NEXT_PUBLIC_`). Gitleaks v CI prochází celou historii. Aplikace vynucuje 2FA správcům prostoru. **Neověřené MFA na účtech GitHub, Vercel, Supabase, Hostinger a Resend.** |
| 4 | RLS a Storage ověřené dvěma uživateli | ✅ | RLS (u dat prostorů i vynucené) a testy dvou prostorů: `apps/api/test/rls.test.ts`, `api.test.ts`. CI hlídá, že každá tabulka s `workspace_id` má RLS. V produkci ověřeno, že role `anon`/`authenticated` nemají do schématu `hub` přístup. Storage N/A (žádné soubory). |
| 5 | Login, odhlášení, reset hesla, povolené návratové adresy | ✅ | `e2e-live/live.spec.ts`, `account.test.ts`. Odkazy v e-mailech vedou jen na `WEB_ORIGIN`, kontrola Origin na zápisech. Registrace vypnutá, účty jen pozvánkou. |
| 6 | Hlavní scénář, formuláře, soubory, mobil | ✅ | E2E: kontakty, tým, pozvánka, zabezpečení. Mobil ručně. Soubory N/A. |
| 7 | CI prošlo; plán migrace a návratu | ⚠️ | CI zelené (typy, unit testy, build, audit závislostí, API + RLS testy, Gitleaks). Migrace jen `prisma migrate deploy`, aditivní. **Návrat DB bez zálohy není možný** (viz 10). |
| 8 | HTTPS a DNS; režim Cloudflare | ✅ | HTTPS všude (HSTS na webu, TLS `verify-full` k DB). Vlastní doména zatím není. Cloudflare N/A. |
| 9 | Privátní data mimo sdílenou cache; limity, AI rozpočet | ✅ | API posílá `Cache-Control: no-store` (test v `proxy.test.ts`). Limity přihlášení, resetu a 2FA podle IP, zámek účtu po 5 pokusech. AI rozpočet N/A (AI mimo rozsah). |
| 10 | Záloha DB i souborů, ověřená obnova | ❌ | **Odloženo rozhodnutím zadavatelky (18. 11. 2026).** Supabase Free zálohy nedělá. Soubory N/A. |
| 11 | Monitoring s upozorněním; funkční test po vydání | ⚠️ | Po vydání ověřeno: přihlášení odmítne špatné heslo, hlavičky CSP/HSTS, health check. **Chybí monitoring dostupnosti a chyb s upozorněním určené osobě.** |
| 12 | VPS: data přežijí restart; Tunnel | ✅ / N/A | API je bezstavové (data v Supabase), `restart: unless-stopped`. Tunnel N/A, viz odchylky. Správa přes SSH klíčem. |

## Kontrola kritických změn (str. 3)

Přihlášení, 2FA, role, pozvánky, RLS a nasazení vznikly s AI. **Standard vyžaduje kontrolu backenďákem**, ta zatím neproběhla. Podklady: [ARCHITECTURE.md](ARCHITECTURE.md), migrace v `packages/db/prisma/migrations/`, testy v `apps/api/test/`.

**Supabase Security Advisor** v dashboardu zatím nikdo neprošel. SQL kontrola přístupu rolí API proběhla (položka 4).

## Mimo rozsah (N/A)

Webhooky (žádné příchozí), nahrávání souborů, stahování cizích URL a AI funkce aplikace zatím nemá. Při jejich přidání platí body 03/04 a 01 provozu ze standardu.
