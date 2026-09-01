-- Anti-auto-relation sur CoachAthlete (#11).
--
-- Premier CHECK du projet, et c'est délibéré : `architecture-choice.md` veut les contraintes dans
-- le schéma plutôt que dans le service, et « on ne peut pas être son propre coach » est un
-- invariant absolu — pas une règle métier qui pourrait avoir une exception demain.
--
-- Le service refuse déjà le cas en 409, avec un message. Ce CHECK ne le remplace pas, il le
-- SURVIT : aujourd'hui `InvitationService.accept` est le seul chemin de création, mais rien ne
-- garantit qu'il le restera, et un second chemin qui oublierait la garde ne casserait rien de
-- visible — il produirait une relation sur laquelle tout le reste (messagerie, facturation)
-- suppose deux personnes distinctes.
--
-- Ce cas n'est atteignable que depuis #9/#10 : accepter une invitation exige la capacité athlète,
-- donc seul un compte qui CUMULE peut accepter la sienne. La contrainte arrive avec le premier
-- compte qui pourrait la violer, pas après.
--
-- Prisma ne modélise pas les CHECK : ils ne figurent donc pas dans `schema.prisma` et
-- `prisma migrate dev` ne les touche pas. Le corollaire est qu'ils ne se lisent QUE dans les
-- migrations — d'où ce commentaire.

ALTER TABLE "coach_athlete"
  ADD CONSTRAINT "coach_athlete_not_self" CHECK ("coachId" <> "athleteId");
