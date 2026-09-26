-- Une fiche athlète par couple (coach, athlète), et non plus par athlète (#301).
--
-- L'unicité sur `athleteId` date d'avant l'auto-coaching (#14), quand un athlète n'avait qu'un
-- coach. Un compte qui se coache ET a un coach porte désormais deux fiches : la sienne, et celle
-- que son coach tient sur lui. Le tenancy scope chaque lecture sur `coachId`, donc l'une ne voit
-- jamais l'autre — mais la contrainte, elle, voit toute la table : le second `PUT` tombait en 500.
--
-- Sans risque sur les données existantes : une unicité sur `athleteId` garantit celle du couple.
-- L'index sur `coachId` disparaît, couvert par le préfixe du nouvel index unique.

DROP INDEX "athlete_sheet_athleteId_key";

DROP INDEX "athlete_sheet_coachId_idx";

CREATE UNIQUE INDEX "athlete_sheet_coachId_athleteId_key" ON "athlete_sheet"("coachId", "athleteId");
