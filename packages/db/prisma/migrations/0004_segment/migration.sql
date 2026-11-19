-- Segments (zadání 8.2, kap. 5 Segment): a saved contact filter. Only the rules are stored; members are always
-- evaluated on the server over current data, so a segment never holds a stale copy of personal data.

-- CreateTable
CREATE TABLE "hub"."segment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "match" TEXT NOT NULL DEFAULT 'all',
    "rules" JSONB NOT NULL DEFAULT '[]',
    "created_by_user_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "segment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "segment_workspace_id_name_normalized_key" ON "hub"."segment"("workspace_id", "name_normalized");

-- AddForeignKey
ALTER TABLE "hub"."segment" ADD CONSTRAINT "segment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "hub"."workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hub"."segment" ADD CONSTRAINT "segment_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "hub"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===== hand-written =====
ALTER TABLE hub.segment ALTER COLUMN name TYPE text COLLATE "cs-CZ-x-icu";
ALTER TABLE hub.segment ADD CONSTRAINT segment_match_check CHECK (match IN ('all', 'any'));
ALTER TABLE hub.segment ADD CONSTRAINT segment_rules_array_check CHECK (jsonb_typeof(rules) = 'array');

-- Same tenant isolation as the other tenant tables in 0001_init. A segment holds no personal data, so it may be
-- deleted for real; contacts are never touched by deleting it.
ALTER TABLE hub.segment ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub.segment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON hub.segment TO hub_app
  USING (workspace_id = hub.current_workspace_id() AND hub.has_workspace_access(workspace_id))
  WITH CHECK (workspace_id = hub.current_workspace_id() AND hub.has_workspace_access(workspace_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON hub.segment TO hub_app;
