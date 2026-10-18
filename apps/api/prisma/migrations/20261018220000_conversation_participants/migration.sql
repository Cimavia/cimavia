-- Les conversations ont des participants, à deux ou à plusieurs (#611).
--
-- Une conversation reliait UN coach et UN athlète par deux colonnes, et un message était « lu » par
-- son seul destinataire (`message.readAt`). TI doit pouvoir écrire à C et M ensemble, C à M ou à
-- plusieurs de ses athlètes : chaque conversation compte désormais ses participants, chacun avec
-- son titre et sa marque de lecture.
--
-- Reprise, dans la même transaction :
-- - chaque fil devient une conversation `DIRECT` entre ses deux bouts, le coach au titre COACH,
--   l'athlète au titre ATHLETE ;
-- - sa clé (`participantKey`) liste ses participants triés — `ATHLETE:…` passe avant `COACH:…`,
--   c'est l'ordre que l'API calcule pour toute conversation ;
-- - la marque de lecture de chacun est la date du dernier message REÇU qu'il a lu. `markRead`
--   marquait tout l'entrant d'un coup : ce qui est créé après est exactement ce qui restait non lu,
--   et les compteurs ne bougent pas. Rien lu = `NULL`.
-- Les colonnes `coachId` / `athleteId` (conversation et message) et `message.readAt` partent APRÈS
-- la recopie.

BEGIN;

CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GROUP');

CREATE TYPE "ParticipantCapability" AS ENUM ('COACH', 'ATHLETE');

CREATE TABLE "conversation_participant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" "ParticipantCapability" NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversation_participant_userId_capability_idx" ON "conversation_participant"("userId", "capability");

CREATE UNIQUE INDEX "conversation_participant_conversationId_userId_key" ON "conversation_participant"("conversationId", "userId");

ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "conversation_participant" ("id", "conversationId", "userId", "capability", "lastReadAt", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."coachId", 'COACH', (
    SELECT max(m."createdAt") FROM "message" m
    WHERE m."conversationId" = c."id" AND m."senderId" <> c."coachId" AND m."readAt" IS NOT NULL
), c."createdAt"
FROM "conversation" c;

INSERT INTO "conversation_participant" ("id", "conversationId", "userId", "capability", "lastReadAt", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."athleteId", 'ATHLETE', (
    SELECT max(m."createdAt") FROM "message" m
    WHERE m."conversationId" = c."id" AND m."senderId" <> c."athleteId" AND m."readAt" IS NOT NULL
), c."createdAt"
FROM "conversation" c;

-- Le défaut ne sert qu'à la reprise : toute conversation existante est un fil à deux. L'API
-- décide ensuite de la forme à chaque création.
ALTER TABLE "conversation" ADD COLUMN "kind" "ConversationKind" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN "participantKey" TEXT;

UPDATE "conversation" SET "participantKey" = 'ATHLETE:' || "athleteId" || '|COACH:' || "coachId";

-- squawk-ignore adding-not-nullable-field -- remplie juste au-dessus pour chaque conversation (#611)
ALTER TABLE "conversation" ALTER COLUMN "participantKey" SET NOT NULL;

ALTER TABLE "conversation" ALTER COLUMN "kind" DROP DEFAULT;

CREATE UNIQUE INDEX "conversation_participantKey_key" ON "conversation"("participantKey");

-- `participantKey` reprend l'unicité du couple, sur toutes les conversations.
ALTER TABLE "conversation" DROP CONSTRAINT "conversation_coachId_fkey";

ALTER TABLE "conversation" DROP CONSTRAINT "conversation_athleteId_fkey";

DROP INDEX "conversation_coachId_idx";

DROP INDEX "conversation_athleteId_idx";

DROP INDEX "conversation_coachId_athleteId_key";

DROP INDEX "message_coachId_idx";

DROP INDEX "message_athleteId_idx";

-- squawk-ignore ban-drop-column -- recopiée juste au-dessus dans conversation_participant (#611)
ALTER TABLE "conversation" DROP COLUMN "athleteId";

-- squawk-ignore ban-drop-column -- recopiée juste au-dessus dans conversation_participant (#611)
ALTER TABLE "conversation" DROP COLUMN "coachId";

-- squawk-ignore ban-drop-column -- le message se scope par sa conversation (#611)
ALTER TABLE "message" DROP COLUMN "athleteId";

-- squawk-ignore ban-drop-column -- le message se scope par sa conversation (#611)
ALTER TABLE "message" DROP COLUMN "coachId";

-- squawk-ignore ban-drop-column -- reprise juste au-dessus en lastReadAt de chaque participant (#611)
ALTER TABLE "message" DROP COLUMN "readAt";

COMMIT;
