-- Validation de `access_grant_none_for_coach_or_plan`, posée `NOT VALID` par la migration
-- précédente (#607) : à part, pour que le parcours des lignes ne tienne pas le verrou exclusif.

BEGIN;

ALTER TABLE "access_grant" VALIDATE CONSTRAINT "access_grant_none_for_coach_or_plan";

COMMIT;
