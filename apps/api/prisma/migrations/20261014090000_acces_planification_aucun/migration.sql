-- « Aucun » réglé exprès sur la ligne d'une entreprise d'une PLANIFICATION (#607).
--
-- Une planification créée pour un athlète dont le lien passe par F, ou affectée à cet athlète,
-- s'ouvre par défaut en Écriture à F — sauf si le propriétaire a déjà réglé la ligne de F. Si
-- « Aucun » restait l'absence de ligne, une F fermée exprès ne se distinguerait pas d'une F jamais
-- réglée, et la réaffectation la rouvrirait. Sur une planification, « Aucun » s'écrit donc `NONE`.
-- Exercices et séances gardent l'absence de ligne.
--
-- La contrainte s'ÉLARGIT : toute ligne existante la satisfait déjà. Posée ici `NOT VALID`, le
-- verrou exclusif ne dure que le temps de l'échanger ; le parcours des lignes, lui, se fait dans la
-- migration suivante, sous un verrou qui laisse lire et écrire. Les deux dans la même transaction
-- garderaient l'exclusif jusqu'au bout du parcours.

BEGIN;

ALTER TABLE "access_grant" DROP CONSTRAINT "access_grant_none_for_coach_only";

-- `NONE` ferme ce qu'une entreprise ouvre à l'un de ses Coachs (#608), ou ferme exprès une
-- planification à une entreprise (#607).
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_none_for_coach_or_plan" CHECK ("level" <> 'NONE' OR "coachId" IS NOT NULL OR "planId" IS NOT NULL) NOT VALID;

COMMIT;
