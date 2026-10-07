-- Un lien coach↔athlète par couple, et non plus par athlète (#599).
--
-- L'unicité sur `athleteId` portait la règle « au plus un coach par athlète ». Elle tombe : un
-- athlète peut être suivi par plusieurs coachs, chacun par son propre lien. Le CHECK
-- `coach_athlete_not_self` (#11) ne change pas.
--
-- Sans risque sur les données existantes : une unicité sur `athleteId` garantit celle du couple.
-- L'index sur `coachId` disparaît, couvert par le préfixe du nouvel index unique ; celui sur
-- `athleteId` le remplace, pour le scope athlète qui filtre sur cette colonne.

DROP INDEX "coach_athlete_athleteId_key";

DROP INDEX "coach_athlete_coachId_idx";

CREATE UNIQUE INDEX "coach_athlete_coachId_athleteId_key" ON "coach_athlete"("coachId", "athleteId");

CREATE INDEX "coach_athlete_athleteId_idx" ON "coach_athlete"("athleteId");
