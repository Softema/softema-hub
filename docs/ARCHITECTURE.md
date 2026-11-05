# Architektura

```
apps/web         Next.js. Veřejný web + /aplikace. Režim určuje NEXT_PUBLIC_APP_MODE při sestavení.
  app/hub.tsx        demo: ukázková data v localStorage, bez API
  app/live/          databázová verze: přihlášení, kontakty, TanStack Query nad API
apps/api         NestJS: REST /api/v1, Better-Auth /api/auth
packages/db      Prisma schéma, migrace, role, seed
packages/shared  zod schémata, typy odpovědí, role a oprávnění
```

## Oddělení dema

Aliasy v [apps/web/next.config.ts](../apps/web/next.config.ts) vyberou při sestavení právě jednu aplikaci. Demo neobsahuje volání API ani přihlášení, databázová verze neobsahuje seed ani úložiště dema. Sestavení jdou do `.next` a `.next-live`. Ověřuje `pnpm check:separation`. Komponenty databázové verze sdílejí s demem jen vzhled: CSS, `ui.tsx`, `kit-core.tsx`.

## Bezpečnost dat

Požadavek prochází třemi nezávislými vrstvami:

1. `SessionGuard`: platná session, u změn navíc kontrola `Origin`.
2. `WorkspaceGuard`: role se zjišťuje z databáze, ID prostoru z URL je jen požadavek. Cizí a neexistující prostor odpovídají stejně (404).
3. PostgreSQL RLS: `withTenant` nastaví `app.user_id` a `app.workspace_id` lokálně v transakci. Politika ověřuje kontext i skutečné členství.

| Databázová role | Použití | Oprávnění |
| --- | --- | --- |
| vlastník | jen migrace a seed identit | vlastní schéma `hub` |
| `hub_app` | API | bez `BYPASSRLS`, tenant tabulky pod FORCE RLS, z `user` jen `id, name, email`, bez hesel a session |
| `hub_auth` | Better-Auth | jen `user`, `session`, `account`, `verification` |

Kontakty a poznámky aplikace nemůže tvrdě mazat, historie a audit jsou jen pro přidávání, členství jen pro čtení.

## API (`/api/v1`, cookie session)

`{ws}` = `/workspaces/:workspaceId`.

| Metoda a cesta | Účel | Oprávnění |
| --- | --- | --- |
| `GET /me` | uživatel a jeho prostory | přihlášený |
| `GET {ws}/members` | členové prostoru | člen |
| `GET {ws}/contacts` | seznam: `q, stage, tag, source, sort, page, limit` | člen |
| `POST {ws}/contacts` | vytvoření | člen |
| `GET {ws}/contacts/:id` | detail s poznámkami, zapisuje audit čtení | člen |
| `PATCH {ws}/contacts/:id` | úprava, povinné `version` | člen |
| `DELETE {ws}/contacts/:id` | měkké smazání | správce |
| `GET {ws}/tags` | štítky prostoru | člen |
| `POST`, `DELETE {ws}/contacts/:id/tags[/:tagId]` | štítky kontaktu | člen |
| `POST`, `PATCH`, `DELETE {ws}/contacts/:id/notes[/:noteId]` | poznámky | člen |
| `GET {ws}/contacts/:id/activities` | časová osa, `cursor` | člen |

Chyby: `{ code, message, fields? }`. Kódy `UNAUTHENTICATED` 401, `FORBIDDEN` a `BAD_ORIGIN` 403, `NOT_FOUND` 404, `DUPLICATE_EMAIL` a `VERSION_CONFLICT` 409, `VALIDATION_FAILED` 422, `SERVICE_UNAVAILABLE` 503.

## Vývojová rozhodnutí

- Prisma 7 s driver adapterem. Oficiální vzor `set_config` v transakci, ověřeno PoC ([POC-AUTH-RLS.md](POC-AUTH-RLS.md)).
- Vlastní tabulky členství místo pluginu `organization` z Better-Auth: agenturní úroveň a RLS.
- Better-Auth je v Nest zapojený přímo přes `toNodeHandler` a `getSession`, bez komunitního balíčku.
- API běží přes `tsx`. Závislosti se injektují explicitně přes `@Inject`, metadata dekorátorů nejsou potřeba. Produkční sestavení API zatím není řešené.

## Známá omezení první dávky

- Běží jen lokálně. **Reset hesla, 2FA, pozvánky a správa uživatelů nejsou hotové, proto systém nesmí dostat reálná data.**
- Omezení pokusů o přihlášení je v paměti procesu a podle IP, bez uzamčení účtu. `x-forwarded-for` je důvěryhodné jen proto, že API poslouchá na 127.0.0.1 za Next.js.
- Vlastní pole, souhlasy, import a hromadné akce v databázové verzi nejsou.
- CSP pro web ještě není nastavená.
