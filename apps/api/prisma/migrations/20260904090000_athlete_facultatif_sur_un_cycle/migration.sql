-- Athlète facultatif sur un cycle en construction (#144).
--
-- Un cycle se construit avant de savoir pour qui : `athleteId` devient NULLABLE. Le verrou ne
-- disparaît pas, il se DÉPLACE — l'athlète reste obligatoire à la diffusion (garde applicative
-- dans `PlanService.publish`), comme la facturation l'est depuis P6.
--
-- SIX tables, et non les cinq qu'on croit : `athleteId` est dénormalisé sur toute la chaîne de
-- planification parce que l'extension tenant filtre par un champ du modèle INTERROGÉ et ne sait
-- pas remonter la relation (`where: { plan: { athleteId } }` n'existe pas pour elle). La sixième
-- est `scheduled_session_exercise_tag` : l'oublier laisserait poser un exercice sans tag dans un
-- brouillon non affecté, et casser dès qu'on lui en ajoute un.
--
-- Les index `[athleteId, status]` et `[athleteId, scheduledDate]` restent en place : Postgres ne
-- fait jamais correspondre un NULL à une égalité, ce qui est exactement le comportement voulu —
-- un brouillon sans destinataire est invisible de TOUS les athlètes par construction, et non
-- parce qu'une règle applicative pense à l'exclure.
--
-- Purement permissif : aucune ligne existante ne change, et rien ne PRODUIT encore de NULL à ce
-- stade (la création exige toujours un athlète). Rien à reprendre en arrière côté données.

ALTER TABLE "plan" ALTER COLUMN "athleteId" DROP NOT NULL;
ALTER TABLE "plan_week" ALTER COLUMN "athleteId" DROP NOT NULL;
ALTER TABLE "scheduled_session" ALTER COLUMN "athleteId" DROP NOT NULL;
ALTER TABLE "scheduled_session_exercise" ALTER COLUMN "athleteId" DROP NOT NULL;
ALTER TABLE "scheduled_session_exercise_document" ALTER COLUMN "athleteId" DROP NOT NULL;
ALTER TABLE "scheduled_session_exercise_tag" ALTER COLUMN "athleteId" DROP NOT NULL;
