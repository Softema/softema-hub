-- Temporary sign-in lock after repeated wrong passwords (zadání 6.1). Only the auth role reads or writes it.

-- CreateTable
CREATE TABLE "hub"."login_lock" (
    "email_normalized" TEXT NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "last_failed_at" TIMESTAMPTZ NOT NULL,
    "locked_until" TIMESTAMPTZ,

    CONSTRAINT "login_lock_pkey" PRIMARY KEY ("email_normalized")
);

-- ===== hand-written =====
GRANT SELECT, INSERT, UPDATE, DELETE ON hub.login_lock TO hub_auth;
