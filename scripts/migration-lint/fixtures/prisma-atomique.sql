-- Ce que `prisma migrate dev` génère d'ordinaire, enveloppé dans sa transaction : rien à signaler.
-- Chaque instruction ici est une règle exclue par `.squawk.toml`, et doit le rester sans bruit.
BEGIN;

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('DRAFT', 'DONE');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COMPANY';

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_coachId_idx" ON "plan"("coachId");

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sur une table existante : index, clé étrangère, colonne avec défaut.
CREATE UNIQUE INDEX "session_planId_key" ON "session"("planId");
ALTER TABLE "session" ADD CONSTRAINT "session_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "session" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "session_old_idx";

-- Compatibilité entre versions, sans perte : renommer, rendre facultatif, retirer un défaut.
ALTER TABLE "session" RENAME COLUMN "label" TO "title";
ALTER TABLE "session" RENAME TO "workout";
ALTER TABLE "workout" ALTER COLUMN "athleteId" DROP NOT NULL;
ALTER TABLE "workout" ALTER COLUMN "rank" DROP DEFAULT;

COMMIT;
