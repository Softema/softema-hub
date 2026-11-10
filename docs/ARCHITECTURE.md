# Architektura

```
apps/web         Next.js. Veřejný web + /aplikace. Režim určuje NEXT_PUBLIC_APP_MODE při sestavení.
  app/hub.tsx        demo: ukázková data v localStorage, bez API
  app/live/          databázová verze: přihlášení s 2FA, kontakty, tým, zabezpečení účtu, TanStack Query nad API
apps/api         NestJS: REST /api/v1, Better-Auth /api/auth
packages/db      Prisma schéma, migrace, role, seed
packages/shared  zod schémata, typy odpovědí, role a oprávnění
```

## Oddělení dema

Aliasy v [apps/web/next.config.ts](../apps/web/next.config.ts) vyberou při sestavení právě jednu aplikaci. Demo neobsahuje volání API ani přihlášení, databázová verze neobsahuje seed ani úložiště dema. Sestavení jdou do `.next` a `.next-live`. Ověřuje `pnpm check:separation`. Komponenty databázové verze sdílejí s demem jen vzhled: CSS, `ui.tsx`, `kit-core.tsx`.

## Bezpečnost dat

Požadavek prochází třemi nezávislými vrstvami:

1. `SessionGuard`: platná session, u změn navíc kontrola `Origin`.
2. `WorkspaceGuard`: role se zjišťuje z databáze, ID prostoru z URL je jen požadavek. Cizí a neexistující prostor odpovídají stejně (404). Správce bez zapnuté 2FA dostane `TWO_FACTOR_REQUIRED` (403) a žádná data.
3. PostgreSQL RLS: `withTenant` nastaví `app.user_id` a `app.workspace_id` lokálně v transakci. Politika ověřuje kontext i skutečné členství.

| Databázová role | Použití | Oprávnění |
| --- | --- | --- |
| vlastník | jen migrace a seed identit | vlastní schéma `hub` |
| `hub_app` | API | bez `BYPASSRLS`, tenant tabulky pod FORCE RLS, z `user` jen `id, name, email, twoFactorEnabled`, bez hesel, session a tajemství 2FA, z `invitation` vše kromě `token_hash` |
| `hub_auth` | Better-Auth | jen `user`, `session`, `account`, `verification`, `twoFactor` |

Kontakty a poznámky aplikace nemůže tvrdě mazat, historie a audit jsou jen pro přidávání. Členství a pozvánky aplikace sama zapisovat nemůže: mění je jen funkce `SECURITY DEFINER` z migrace `0002` (`invite_member`, `revoke_invitation`, `set_member_role`, `remove_member`, `accept_invitation`). Ty roli volajícího ověřují znovu v databázi, takže chyba nebo chybějící kontrola v API přístup nepřidá.

## Účty a tým

- **2FA (TOTP)** přes plugin Better-Auth: klíč a záložní kódy jsou zašifrované `BETTER_AUTH_SECRET`, po 5 chybných kódech se ověření na 15 minut zamkne. Povinná pro `agency_admin` a `workspace_admin`. Správce bez 2FA vidí jen obrazovku pro její zapnutí a API mu nevrátí data. Vypnout ji správce nemůže.
- **Obnova hesla:** odkaz platí 1 hodinu a jen jednou. V tabulce `verification` je jen hash tokenu (`storeIdentifier: "hashed"`). Po změně hesla se zruší všechny session. Odpověď je stejná, ať účet existuje, nebo ne.
- **Pozvánky** platí 7 dní a jen jednou, v databázi je SHA-256 tokenu. Nová pozvánka na stejný e-mail tu předchozí zneplatní. Bez účtu si pozvaný účet založí, s existujícím účtem musí pozvánku přijmout přihlášený a jen pod stejným e-mailem. Registrace mimo pozvánky je vypnutá.
- Tokeny z e-mailů jsou ve fragmentu URL (`/nove-heslo#…`, `/pozvanka#…`). Prohlížeč je neposílá serveru a stránka je hned odstraní z adresního řádku.
- **E-maily** jdou přes rozhraní `Mailer` ([apps/api/src/mail/mailer.ts](../apps/api/src/mail/mailer.ts)). Lokálně se nic neodesílá, zprávy se ukládají jako HTML do `.outbox/`. Testy používají `MemoryMailer`.
- Změny rolí, členství a pozvánek se zapisují do `audit_log`.

## API (`/api/v1`, cookie session)

`{ws}` = `/workspaces/:workspaceId`.

| Metoda a cesta | Účel | Oprávnění |
| --- | --- | --- |
| `GET /me` | uživatel a jeho prostory | přihlášený |
| `GET {ws}/members` | členové prostoru s e-mailem a stavem 2FA | člen |
| `PATCH {ws}/members/:userId` | změna role (`workspace_admin`, `member`), ne sobě | správce |
| `DELETE {ws}/members/:userId` | odebrání z prostoru, ne sebe | správce |
| `GET`, `POST {ws}/invitations` | čekající pozvánky, nová pozvánka (odešle e-mail) | správce |
| `DELETE {ws}/invitations/:id` | zrušení pozvánky | správce |
| `POST /invitations/preview` | náhled pozvánky podle tokenu, bez session | kdokoli s tokenem |
| `POST /invitations/accept` | přijetí: nový účet, nebo přihlášený uživatel se stejným e-mailem | kdokoli s tokenem |
| `GET {ws}/contacts` | seznam: `q, stage, tag, source, sort, page, limit` | člen |
| `POST {ws}/contacts` | vytvoření | člen |
| `GET {ws}/contacts/:id` | detail s poznámkami, zapisuje audit čtení | člen |
| `PATCH {ws}/contacts/:id` | úprava, povinné `version` | člen |
| `DELETE {ws}/contacts/:id` | měkké smazání | správce |
| `GET {ws}/tags` | štítky prostoru | člen |
| `POST`, `DELETE {ws}/contacts/:id/tags[/:tagId]` | štítky kontaktu | člen |
| `POST`, `PATCH`, `DELETE {ws}/contacts/:id/notes[/:noteId]` | poznámky | člen |
| `GET {ws}/contacts/:id/activities` | časová osa, `cursor` | člen |

Chyby: `{ code, message, fields? }`. Kódy `UNAUTHENTICATED` 401, `FORBIDDEN`, `BAD_ORIGIN` a `TWO_FACTOR_REQUIRED` 403, `NOT_FOUND` 404, `DUPLICATE_EMAIL`, `VERSION_CONFLICT`, `ALREADY_MEMBER` a `SIGN_IN_REQUIRED` 409, `INVITATION_INVALID` 410, `VALIDATION_FAILED` 422, `SERVICE_UNAVAILABLE` 503.

Přihlášení, 2FA, obnovu a změnu hesla obsluhuje Better-Auth pod `/api/auth` (`sign-in/email`, `two-factor/*`, `request-password-reset`, `reset-password`, `change-password`).

## Vývojová rozhodnutí

- Prisma 7 s driver adapterem. Oficiální vzor `set_config` v transakci, ověřeno PoC ([POC-AUTH-RLS.md](POC-AUTH-RLS.md)).
- Vlastní tabulky členství místo pluginu `organization` z Better-Auth: agenturní úroveň a RLS.
- Better-Auth je v Nest zapojený přímo přes `toNodeHandler` a `getSession`, bez komunitního balíčku.
- API běží přes `tsx`. Závislosti se injektují explicitně přes `@Inject`, metadata dekorátorů nejsou potřeba. Produkční sestavení API zatím není řešené.

## Známá omezení první dávky

- Běží jen lokálně. **Systém pořád nesmí dostat reálná data:** e-maily se neodesílají (jen `.outbox/`), chybí CSP, správa relací (seznam přihlášených zařízení) a nasazení. Prototyp není připravený pro produkci.
- Omezení pokusů (přihlášení, kódy 2FA, obnova hesla) je v paměti procesu a podle IP. Uzamčení účtu existuje jen u kódů 2FA, ne u hesla. `x-forwarded-for` je důvěryhodné jen proto, že API poslouchá na 127.0.0.1 za Next.js. Přijetí pozvánky limit nemá, token má ale 256 bitů.
- Nastavení 2FA ukazuje klíč k opsání a odkaz `otpauth://`, ne QR kód. QR by vyžadoval novou závislost.
- Správce agentury se spravuje jen v databázi (seed), v aplikaci ho přidat ani odebrat nejde.
- Vlastní pole, souhlasy, import a hromadné akce v databázové verzi nejsou.
- CSP pro web ještě není nastavená.
