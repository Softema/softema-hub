# PoC: autentizace, databázové role a izolace prostorů

Provedeno 5. 11. 2026 na PostgreSQL 17.11 (binárky spuštěné lokálně, Docker nebyl k dispozici), Prisma 7.10.1 s `@prisma/adapter-pg`, Better-Auth 1.7.14, `@node-rs/argon2`. Výsledek **25/25**. Zdroj PoC byl dočasný, jeho scénáře jsou nyní trvale v `apps/api/test/rls.test.ts` a `api.test.ts`.

| Otázka | Výsledek |
| --- | --- |
| Drží aplikační role bez `BYPASSRLS` izolaci i s FORCE RLS? | Ano, včetně podvrženého workspace a cizího ID. |
| Neprosákne `set_config` přes pool? | 40 souběžných transakcí střídavě ze dvou prostorů bez úniku, bez kontextu 0 řádků. |
| Režie tenant transakce | 0,6 ms oproti 0,1 ms bez transakce (lokálně, jeden proces). Podezření z hlášení o výkonu pg adaptéru se nepotvrdilo, pod zátěží to ale měřeno nebylo. |
| Better-Auth pod omezenou rolí | Registrace, přihlášení, session a odhlášení fungují. Hash je `$argon2id$`, cookie `HttpOnly; SameSite=Lax`. |
| Oddělení hesel | `hub_app` nečte `account` ani `session`, `hub_auth` nečte kontakty. |

## Kompatibilita se Supabase (bez jeho založení)

Ověřeno na samostatném clusteru, který napodobuje Supabase: vlastník `postgres` není superuser, existují `anon`, `authenticated`, `service_role`, schéma `extensions`. Migrace, role, seed a 12 testů izolace prošly a `anon` ani `authenticated` nemají do schématu `hub` přístup.

Není to test proti skutečnému Supabase. Před použitím ověřit:

- připojení přes pooler v transakčním režimu (nastavení kontextu je na něj připravené),
- `_prisma_migrations` vzniká ve schématu `public`, který Supabase vystavuje přes Data API; přesunout do `hub`, nebo tabulce zapnout RLS,
- `SECURITY DEFINER` funkce `hub.has_workspace_access` a role `service_role`, která má `BYPASSRLS`, ale žádná práva na schéma `hub`.
