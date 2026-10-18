-- La lecture d'un débrief devient propre à chaque Coach (#610).
--
-- C et M suivent la planification de TI : chacun doit lire le débrief à son heure, et la lecture
-- de l'un ne doit pas l'éteindre pour l'autre. `session_feedback.coachReadAt`, un seul horodatage,
-- devient une ligne par Coach lecteur.
--
-- Reprise : chaque `coachReadAt` posé devient la lecture du Coach du débrief — le seul qui pouvait
-- le marquer lu jusqu'ici. Un débrief jamais lu, ou complété depuis, n'en reçoit aucune : il reste
-- « à relire ». La colonne part APRÈS la recopie, dans la même transaction.

BEGIN;

CREATE TABLE "session_feedback_read" (
    "id" TEXT NOT NULL,
    "sessionFeedbackId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_feedback_read_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "session_feedback_read_coachId_idx" ON "session_feedback_read"("coachId");

CREATE UNIQUE INDEX "session_feedback_read_sessionFeedbackId_coachId_key" ON "session_feedback_read"("sessionFeedbackId", "coachId");

ALTER TABLE "session_feedback_read" ADD CONSTRAINT "session_feedback_read_sessionFeedbackId_fkey" FOREIGN KEY ("sessionFeedbackId") REFERENCES "session_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "session_feedback_read" ADD CONSTRAINT "session_feedback_read_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "session_feedback_read" ("id", "sessionFeedbackId", "coachId", "readAt")
SELECT gen_random_uuid()::text, f."id", f."coachId", f."coachReadAt"
FROM "session_feedback" f
WHERE f."coachReadAt" IS NOT NULL;

-- L'index de la tuile portait `coachReadAt` ; celui sur `coachId` seul garde la lecture par Coach.
DROP INDEX "session_feedback_coachId_coachReadAt_idx";

CREATE INDEX "session_feedback_coachId_idx" ON "session_feedback"("coachId");

-- squawk-ignore ban-drop-column -- recopiée juste au-dessus dans session_feedback_read (#610)
ALTER TABLE "session_feedback" DROP COLUMN "coachReadAt";

COMMIT;
