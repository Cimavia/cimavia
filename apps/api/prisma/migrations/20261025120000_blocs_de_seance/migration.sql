-- Les structures et les blocs de séance (#716, épic #714) : phase EXPAND.
--
-- Une séance devient une suite de blocs, chacun copiant une structure (Séries, EMOM… ou celle du
-- Coach) et portant 1 à N exercices. Les nouvelles colonnes s'ajoutent à côté des anciennes, toutes
-- nullables : les lignes existantes gardent l'ancien modèle, que la migration suivante reprend.
-- L'ancien modèle tombe en #723.
--
-- Les CHECK portent ce que Prisma ne sait pas dire : un bloc vient d'une structure du Coach OU
-- d'une structure prête ; un exercice est dans un bloc avec son rang, sa clé et sa grille, ou dans
-- aucun ; un remplaçant, et lui seul, dit quelle clé il remplace.

BEGIN;

-- CreateEnum
CREATE TYPE "StructurePreset" AS ENUM ('SERIES', 'EMOM', 'AMRAP', 'TABATA', 'FOR_TIME', 'FREE');

-- CreateEnum
CREATE TYPE "CompositionOrigin" AS ENUM ('RECEIVED', 'ADDED', 'REPLACEMENT');

-- AlterTable
ALTER TABLE "exercise" ADD COLUMN     "suggestedMetrics" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "scheduled_session_exercise" ADD COLUMN     "blockId" TEXT,
ADD COLUMN     "blockPosition" INTEGER,
ADD COLUMN     "grid" JSONB,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "origin" "CompositionOrigin",
ADD COLUMN     "replacesKey" TEXT;

-- AlterTable
ALTER TABLE "session_exercise" ADD COLUMN     "blockId" TEXT,
ADD COLUMN     "blockPosition" INTEGER,
ADD COLUMN     "grid" JSONB,
ADD COLUMN     "key" TEXT;

-- CreateTable
CREATE TABLE "structure" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "instructions" TEXT,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "structure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_block" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "instructions" TEXT,
    "settings" JSONB NOT NULL,
    "copiedSettings" JSONB NOT NULL,
    "sourceStructureId" TEXT,
    "sourcePreset" "StructurePreset",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_session_block" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT,
    "scheduledSessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "instructions" TEXT,
    "settings" JSONB NOT NULL,
    "copiedSettings" JSONB NOT NULL,
    "sourceStructureId" TEXT,
    "sourcePreset" "StructurePreset",
    "baseline" JSONB NOT NULL,
    "tracking" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_session_block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "structure_coachId_idx" ON "structure"("coachId");

-- CreateIndex
CREATE INDEX "session_block_coachId_idx" ON "session_block"("coachId");

-- CreateIndex
CREATE INDEX "session_block_sourceStructureId_idx" ON "session_block"("sourceStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "session_block_sessionId_position_key" ON "session_block"("sessionId", "position");

-- CreateIndex
CREATE INDEX "scheduled_session_block_coachId_idx" ON "scheduled_session_block"("coachId");

-- CreateIndex
CREATE INDEX "scheduled_session_block_athleteId_idx" ON "scheduled_session_block"("athleteId");

-- CreateIndex
CREATE INDEX "scheduled_session_block_sourceStructureId_idx" ON "scheduled_session_block"("sourceStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_session_block_scheduledSessionId_position_key" ON "scheduled_session_block"("scheduledSessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_session_exercise_blockId_blockPosition_key" ON "scheduled_session_exercise"("blockId", "blockPosition");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_session_exercise_scheduledSessionId_key_key" ON "scheduled_session_exercise"("scheduledSessionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "session_exercise_blockId_blockPosition_key" ON "session_exercise"("blockId", "blockPosition");

-- CreateIndex
CREATE UNIQUE INDEX "session_exercise_sessionId_key_key" ON "session_exercise"("sessionId", "key");

-- AddForeignKey
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "session_block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure" ADD CONSTRAINT "structure_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_block" ADD CONSTRAINT "session_block_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_block" ADD CONSTRAINT "session_block_sourceStructureId_fkey" FOREIGN KEY ("sourceStructureId") REFERENCES "structure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session_exercise" ADD CONSTRAINT "scheduled_session_exercise_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "scheduled_session_block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session_block" ADD CONSTRAINT "scheduled_session_block_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "scheduled_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session_block" ADD CONSTRAINT "scheduled_session_block_sourceStructureId_fkey" FOREIGN KEY ("sourceStructureId") REFERENCES "structure"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "session_block" ADD CONSTRAINT "session_block_one_source" CHECK ("sourceStructureId" IS NULL OR "sourcePreset" IS NULL);

ALTER TABLE "scheduled_session_block" ADD CONSTRAINT "scheduled_session_block_one_source" CHECK ("sourceStructureId" IS NULL OR "sourcePreset" IS NULL);

ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_block_placement" CHECK (
  ("blockId" IS NULL) = ("blockPosition" IS NULL)
  AND ("blockId" IS NULL) = ("key" IS NULL)
  AND ("blockId" IS NULL) = ("grid" IS NULL)
);

ALTER TABLE "scheduled_session_exercise" ADD CONSTRAINT "scheduled_session_exercise_block_placement" CHECK (
  ("blockId" IS NULL) = ("blockPosition" IS NULL)
  AND ("blockId" IS NULL) = ("key" IS NULL)
  AND ("blockId" IS NULL) = ("grid" IS NULL)
  AND ("blockId" IS NULL) = ("origin" IS NULL)
  AND COALESCE("origin" = 'REPLACEMENT', false) = ("replacesKey" IS NOT NULL)
);

COMMIT;
