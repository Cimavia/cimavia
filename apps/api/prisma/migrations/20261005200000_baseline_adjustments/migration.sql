-- #518 : la séance planifiée garde les ajustements REÇUS à la diffusion, à côté de `baseline`.
-- « Revenir au défaut » rend ses marqueurs à une valeur, comme `baseline` lui rend sa valeur.
ALTER TABLE "scheduled_session_exercise"
  ADD COLUMN "baselineAdjustments" JSONB NOT NULL DEFAULT '[]';

-- Reprise EXACTE de l'existant : aucun écran n'a encore écrit de marqueur SCHEDULED, donc tous
-- les ajustements en base sont ceux reçus de la séance-type à la diffusion.
UPDATE "scheduled_session_exercise" SET "baselineAdjustments" = "adjustments";
