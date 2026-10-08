-- L'entreprise invite des athlètes, suivis par tous ses Coachs (#602).
--
-- Pas de lecture « via l'entreprise » : le suivi reste UN LIEN PAR COUPLE dans `coach_athlete`, un
-- par Coach de l'entreprise, et tout ce qui en dépend (planifications, débriefs, factures, fiches,
-- fils) reste valable tel quel. L'entreprise ne garde que la liste de ses athlètes, et chaque lien
-- né d'elle dit d'où il vient.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ORGANIZATION_COACH_JOINED';

-- 1. La provenance d'un lien. Toutes les lignes existantes sont des liens directs : `NULL` les
--    décrit telles qu'elles sont. `SET NULL` à la suppression de l'entreprise : le suivi survit, il
--    redevient direct.
ALTER TABLE "coach_athlete" ADD COLUMN     "organizationId" TEXT;

-- 2. Les athlètes de l'entreprise : une appartenance par couple, comme `organization_coach`.
-- CreateTable
CREATE TABLE "organization_athlete" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_athlete_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_athlete_athleteId_idx" ON "organization_athlete"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_athlete_organizationId_athleteId_key" ON "organization_athlete"("organizationId", "athleteId");

-- CreateIndex
CREATE INDEX "coach_athlete_organizationId_idx" ON "coach_athlete"("organizationId");

-- AddForeignKey
ALTER TABLE "organization_athlete" ADD CONSTRAINT "organization_athlete_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_athlete" ADD CONSTRAINT "organization_athlete_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_athlete" ADD CONSTRAINT "coach_athlete_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

