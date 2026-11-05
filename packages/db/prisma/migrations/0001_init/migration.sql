-- Softema Hub: identity, workspaces, contacts, tags, notes, history.
-- Runs as the owner role. Extensions live in `extensions`, the convention Supabase also uses.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "hub";

-- CreateEnum
CREATE TYPE "hub"."WorkspaceKind" AS ENUM ('internal', 'client');

-- CreateEnum
CREATE TYPE "hub"."WorkspaceRole" AS ENUM ('workspace_admin', 'member');

-- CreateEnum
CREATE TYPE "hub"."ContactStage" AS ENUM ('lead', 'prospect', 'client');

-- CreateTable
CREATE TABLE "hub"."user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."agency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."agency_membership" (
    "agency_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_membership_pkey" PRIMARY KEY ("agency_id","user_id")
);

-- CreateTable
CREATE TABLE "hub"."workspace" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "hub"."WorkspaceKind" NOT NULL DEFAULT 'client',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Prague',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."workspace_membership" (
    "workspace_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "hub"."WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_membership_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "hub"."contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "stage" "hub"."ContactStage" NOT NULL DEFAULT 'lead',
    "source" TEXT NOT NULL DEFAULT 'Ruční zadání',
    "owner_user_id" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "search_text" TEXT,

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."contact_tag" (
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tag_pkey" PRIMARY KEY ("contact_id","tag_id")
);

-- CreateTable
CREATE TABLE "hub"."note" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "actor_user_id" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hub"."audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "changed_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "hub"."user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "hub"."session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "hub"."session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "hub"."account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "hub"."verification"("identifier");

-- CreateIndex
CREATE INDEX "agency_membership_user_id_idx" ON "hub"."agency_membership"("user_id");

-- CreateIndex
CREATE INDEX "workspace_agency_id_idx" ON "hub"."workspace"("agency_id");

-- CreateIndex
CREATE INDEX "workspace_membership_user_id_idx" ON "hub"."workspace_membership"("user_id");

-- CreateIndex
CREATE INDEX "contact_workspace_id_created_at_idx" ON "hub"."contact"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "contact_workspace_id_id_key" ON "hub"."contact"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_workspace_id_id_key" ON "hub"."tag"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_workspace_id_name_normalized_key" ON "hub"."tag"("workspace_id", "name_normalized");

-- CreateIndex
CREATE INDEX "contact_tag_workspace_id_tag_id_idx" ON "hub"."contact_tag"("workspace_id", "tag_id");

-- CreateIndex
CREATE INDEX "note_workspace_id_contact_id_created_at_idx" ON "hub"."note"("workspace_id", "contact_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_workspace_id_contact_id_created_at_idx" ON "hub"."activity"("workspace_id", "contact_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_workspace_id_created_at_idx" ON "hub"."audit_log"("workspace_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "hub"."session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "hub"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "hub"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."agency_membership" ADD CONSTRAINT "agency_membership_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "hub"."agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."agency_membership" ADD CONSTRAINT "agency_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "hub"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."workspace" ADD CONSTRAINT "workspace_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "hub"."agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."workspace_membership" ADD CONSTRAINT "workspace_membership_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "hub"."workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."workspace_membership" ADD CONSTRAINT "workspace_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "hub"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."contact" ADD CONSTRAINT "contact_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "hub"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."contact_tag" ADD CONSTRAINT "contact_tag_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "hub"."contact"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."contact_tag" ADD CONSTRAINT "contact_tag_workspace_id_tag_id_fkey" FOREIGN KEY ("workspace_id", "tag_id") REFERENCES "hub"."tag"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."note" ADD CONSTRAINT "note_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "hub"."contact"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."note" ADD CONSTRAINT "note_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "hub"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."activity" ADD CONSTRAINT "activity_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "hub"."contact"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."activity" ADD CONSTRAINT "activity_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "hub"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===== Everything below is hand-written: what Prisma cannot express =====

-- Czech sort order
ALTER TABLE hub.contact ALTER COLUMN name TYPE text COLLATE "cs-CZ-x-icu";
ALTER TABLE hub.contact ALTER COLUMN company TYPE text COLLATE "cs-CZ-x-icu";
ALTER TABLE hub.tag ALTER COLUMN name TYPE text COLLATE "cs-CZ-x-icu";

-- Search with and without diacritics (zadání 3.3). unaccent() itself is not IMMUTABLE, so it needs a wrapper.
CREATE FUNCTION hub.search_fold(value text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
  AS $$ SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, value)) $$;

ALTER TABLE hub.contact DROP COLUMN search_text;
ALTER TABLE hub.contact ADD COLUMN search_text text GENERATED ALWAYS AS (
  hub.search_fold(name || ' ' || email || ' ' || phone || ' ' || company || ' ' || city)
) STORED;
CREATE INDEX contact_search_idx ON hub.contact USING gin (search_text extensions.gin_trgm_ops);

-- One live contact per e-mail in a workspace; a soft-deleted contact does not block a new one.
CREATE UNIQUE INDEX contact_workspace_email_live_key ON hub.contact (workspace_id, email_normalized) WHERE deleted_at IS NULL;

-- ---------- roles ----------
-- Passwords and LOGIN are set by packages/db/scripts/roles.ts, so no secret is ever part of a migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hub_app') THEN CREATE ROLE hub_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hub_auth') THEN CREATE ROLE hub_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; END IF;
END $$;

REVOKE ALL ON SCHEMA hub FROM PUBLIC;
GRANT USAGE ON SCHEMA hub TO hub_app, hub_auth;
GRANT USAGE ON SCHEMA extensions TO hub_app, hub_auth;

-- ---------- tenant context ----------
CREATE FUNCTION hub.current_user_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
CREATE FUNCTION hub.current_workspace_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;

-- SECURITY DEFINER runs as the owner, who is not subject to RLS on the membership tables (they are not FORCEd).
-- It always answers for the user in the context, never for a caller-supplied user.
CREATE FUNCTION hub.has_workspace_access(ws uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$
    SELECT EXISTS (SELECT 1 FROM hub.workspace_membership m WHERE m.workspace_id = ws AND m.user_id = hub.current_user_id())
        OR EXISTS (SELECT 1 FROM hub.workspace w JOIN hub.agency_membership a ON a.agency_id = w.agency_id WHERE w.id = ws AND a.user_id = hub.current_user_id())
  $$;
REVOKE ALL ON FUNCTION hub.has_workspace_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hub.has_workspace_access(uuid) TO hub_app;

-- ---------- grants: identity ----------
-- Better-Auth role: authentication tables only.
GRANT SELECT, INSERT, UPDATE, DELETE ON hub."user", hub.session, hub.account, hub.verification TO hub_auth;
-- Application role: public profile columns only. It can never read sessions or password hashes.
GRANT SELECT (id, name, email) ON hub."user" TO hub_app;

-- ---------- tenancy: read-only for the application ----------
GRANT SELECT ON hub.agency, hub.agency_membership, hub.workspace, hub.workspace_membership TO hub_app;
ALTER TABLE hub.agency ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub.agency_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub.workspace_membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_read ON hub.agency FOR SELECT TO hub_app
  USING (EXISTS (SELECT 1 FROM hub.agency_membership a WHERE a.agency_id = id AND a.user_id = hub.current_user_id()));
CREATE POLICY agency_membership_read ON hub.agency_membership FOR SELECT TO hub_app USING (user_id = hub.current_user_id());
CREATE POLICY workspace_read ON hub.workspace FOR SELECT TO hub_app USING (hub.has_workspace_access(id));
CREATE POLICY workspace_membership_read ON hub.workspace_membership FOR SELECT TO hub_app
  USING (user_id = hub.current_user_id() OR hub.has_workspace_access(workspace_id));

-- ---------- tenant tables ----------
-- FORCE keeps RLS on even for the table owner. The policy checks both the context and real membership,
-- so a bug that sets a foreign workspace id still sees nothing.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contact', 'tag', 'contact_tag', 'note', 'activity', 'audit_log'] LOOP
    EXECUTE format('ALTER TABLE hub.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE hub.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON hub.%I TO hub_app USING (workspace_id = hub.current_workspace_id() AND hub.has_workspace_access(workspace_id)) WITH CHECK (workspace_id = hub.current_workspace_id() AND hub.has_workspace_access(workspace_id))', t);
  END LOOP;
END $$;

-- Contacts and notes are only ever soft-deleted; history and audit are append-only.
GRANT SELECT, INSERT, UPDATE ON hub.contact, hub.note, hub.tag TO hub_app;
GRANT SELECT, INSERT, DELETE ON hub.contact_tag TO hub_app;
GRANT SELECT, INSERT ON hub.activity, hub.audit_log TO hub_app;
