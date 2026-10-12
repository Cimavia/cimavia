-- La même migration Prisma, sans son `BEGIN;` … `COMMIT;` : Prisma ne l'enveloppe pas, une
-- instruction qui échoue laisserait appliquées celles d'avant. Chacune doit le signaler.

-- ✗ prefer-robust-stmts
CREATE TABLE "plan" ("id" TEXT NOT NULL, CONSTRAINT "plan_pkey" PRIMARY KEY ("id"));

-- ✗ prefer-robust-stmts
CREATE INDEX "plan_id_idx" ON "plan"("id");

-- Rejouable, donc admis hors transaction : la voie d'un `CREATE INDEX CONCURRENTLY`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "session_planId_idx" ON "session"("planId");
