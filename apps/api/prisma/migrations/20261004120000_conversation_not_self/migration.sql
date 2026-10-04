-- Anti-fil avec soi-même sur Conversation (#316).
--
-- Même invariant que `coach_athlete_not_self` (#11), porté par la même voie : un fil a deux
-- personnes, ou il n'a pas d'objet. `ConversationService.open` refusait déjà le cas (409), mais
-- l'avis de débrief passait par `ensure` sans garde : en auto-coaching, chaque débrief ouvrait un
-- fil (soi, soi) et y posait un avis signé de soi, que la boîte de réception lisait comme
-- « Répondu ». La garde est revenue dans `FeedbackAnnouncerService` ; ce CHECK SURVIT au prochain
-- chemin qui l'oublierait.
--
-- Prisma ne modélise pas les CHECK : celui-ci ne se lit QUE dans les migrations.

-- 1. Les fils (soi, soi) déjà posés ne contiennent que des avis : aucune route n'y écrit autre
--    chose (`open` les refuse, aucun écran n'a jamais eu leur id). Si un humain y a pourtant écrit,
--    on s'ARRÊTE plutôt que d'effacer sa donnée — et d'orpheliner ses médias dans le stockage.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "message" m
    JOIN "conversation" c ON c."id" = m."conversationId"
    WHERE c."coachId" = c."athleteId"
      AND m."type" NOT IN ('FEEDBACK_CREATED', 'FEEDBACK_UPDATED')
  ) THEN
    RAISE EXCEPTION 'conversation_not_self : un fil avec soi-même contient un message écrit, purge à arbitrer à la main';
  END IF;
END $$;

-- 2. La purge : les avis partent avec leur fil (`message_conversationId_fkey` en CASCADE).
DELETE FROM "conversation" WHERE "coachId" = "athleteId";

-- 3. Le verrou.
ALTER TABLE "conversation"
  ADD CONSTRAINT "conversation_not_self" CHECK ("coachId" <> "athleteId");
