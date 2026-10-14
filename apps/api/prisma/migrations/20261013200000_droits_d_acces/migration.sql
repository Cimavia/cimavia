-- Droits d'accès sur les exercices, les séances et les planifications (#605).
--
-- Une table pour les trois cibles, créée complète dès ici : #607 y ouvrira les planifications,
-- #608 les lignes Coach et `NONE`. La migrer une seconde fois, une fois qu'elle porte de vraies
-- données, coûterait plus que ses colonnes encore inutilisées.
--
-- Prisma ne modélise ni les CHECK ni `NULLS NOT DISTINCT` : les trois verrous ci-dessous ne se
-- lisent QUE dans cette migration. L'index unique garde le nom que le `@@unique` du schéma déclare,
-- pour que Prisma le reconnaisse au lieu de vouloir le recréer.

BEGIN;

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('NONE', 'READ', 'WRITE');

-- CreateTable
CREATE TABLE "access_grant" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "exerciseId" TEXT,
    "sessionId" TEXT,
    "planId" TEXT,
    "organizationId" TEXT,
    "coachId" TEXT,
    "level" "AccessLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_grant_pkey" PRIMARY KEY ("id"),
    -- Une cible exactement : un droit sans cible n'ouvrirait rien, un droit à deux cibles ne
    -- dirait pas laquelle il ouvre.
    CONSTRAINT "access_grant_single_target" CHECK (num_nonnulls("exerciseId", "sessionId", "planId") = 1),
    -- Un bénéficiaire exactement : une entreprise (et ses Coachs), ou un Coach.
    CONSTRAINT "access_grant_single_beneficiary" CHECK (num_nonnulls("organizationId", "coachId") = 1),
    -- `NONE` ferme ce qu'une entreprise ouvre à l'un de ses Coachs (#608). Sur la ligne d'une
    -- entreprise, « Aucun » est l'absence de ligne : un `NONE` y serait un second état pour la
    -- même chose.
    CONSTRAINT "access_grant_none_for_coach_only" CHECK ("level" <> 'NONE' OR "coachId" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "access_grant_ownerId_idx" ON "access_grant"("ownerId");

-- CreateIndex
CREATE INDEX "access_grant_sessionId_idx" ON "access_grant"("sessionId");

-- CreateIndex
CREATE INDEX "access_grant_planId_idx" ON "access_grant"("planId");

-- CreateIndex
CREATE INDEX "access_grant_organizationId_idx" ON "access_grant"("organizationId");

-- CreateIndex
CREATE INDEX "access_grant_coachId_idx" ON "access_grant"("coachId");

-- Une ligne par couple (cible, bénéficiaire). `NULLS NOT DISTINCT` : chaque ligne a trois
-- colonnes à NULL, que l'unicité par défaut tiendrait pour toutes différentes — deux droits de F
-- sur le même exercice y passeraient. Préfixé par `exerciseId`, il sert aussi la lecture des
-- droits d'un exercice.
CREATE UNIQUE INDEX "access_grant_target_beneficiary_key" ON "access_grant"("exerciseId", "sessionId", "planId", "organizationId", "coachId") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
