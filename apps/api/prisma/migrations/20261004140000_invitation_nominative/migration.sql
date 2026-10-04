-- Une invitation vise toujours une adresse, et ne porte plus de code (#390).
--
-- Les invitations GÉNÉRIQUES (`email` NULL) disparaissent avec la colonne qui les rendait
-- possibles. Leur sort ne se suppose pas : il s'écrit, ligne par ligne, selon ce que chacune porte.

-- 1. Une invitation générique ACCEPTÉE est la trace de la façon dont une relation s'est nouée
--    (#146) : elle la garde, en prenant l'adresse de l'athlète qui l'a acceptée — normalisée comme
--    `normalizeEmail`, puisque c'est sous cette forme que la colonne se compare.
UPDATE "coach_invitation" AS i
SET "email" = lower(trim(u."email"))
FROM "user" AS u
WHERE i."email" IS NULL
  AND i."status" = 'ACCEPTED'
  AND i."acceptedByAthleteId" = u."id";

-- 2. Toutes les autres sont supprimées, explicitement : celles qui attendaient encore (personne
--    n'est plus en mesure de les accepter), et les acceptées dont l'athlète a supprimé son compte
--    (`acceptedByAthleteId` passé à NULL, il n'y a plus d'adresse à leur donner). Un refus ou une
--    révocation générique n'a jamais pu exister : le refus exigeait une adresse, et aucune route ne
--    révoquait.
DELETE FROM "coach_invitation" WHERE "email" IS NULL;

-- 3. Le verrou : l'adresse devient obligatoire.
ALTER TABLE "coach_invitation" ALTER COLUMN "email" SET NOT NULL;

-- 4. Le code ne verrouille plus rien — c'est l'adresse de la session qui le fait. Il quitte le
--    contrat ET la base : un identifiant que plus personne ne lit n'a pas à rester unique.
DROP INDEX "coach_invitation_code_key";
ALTER TABLE "coach_invitation" DROP COLUMN "code";
