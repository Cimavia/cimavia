-- Rompre un lien coach↔athlète (#909), sans rien effacer (Tranché en #213).
--
-- Le lien passe à ENDED et garde sa date de fin ; les cycles du couple en reçoivent une copie, que
-- le scope tenant lit pour les fermer en écriture. Aucune ligne existante n'est rompue : les deux
-- colonnes naissent à NULL, « suivi en cours ». La nouvelle valeur d'enum n'est utilisée par aucune
-- instruction de cette transaction.

BEGIN;

ALTER TYPE "CoachAthleteStatus" ADD VALUE 'ENDED';

ALTER TABLE "coach_athlete" ADD COLUMN "endedAt" TIMESTAMP(3);

ALTER TABLE "plan" ADD COLUMN "followEndedAt" TIMESTAMP(3);

COMMIT;
