-- Retrait d'ExerciseCategory (#163) — phase *contract* d'un expand/migrate/contract.
--
-- L'expand et le migrate ont eu lieu en #162 : `exercise_tag` et `scheduled_session_exercise_tag`
-- existent, et la migration `20260824061500_reprise_categories_en_tags` a repris chaque catégorie
-- en tag minuscule. Toutes les surfaces (web, mobile, API) lisent désormais les tags — plus rien
-- n'écrit ni ne lit `category`.
--
-- Ce retrait est IRRÉVERSIBLE dans les faits : le `down` recréerait la colonne mais pas ses
-- valeurs. C'est acceptable parce que l'information n'est pas perdue — elle vit dans les tags
-- « renfo », « grimpe », « technique » posés par la reprise.

ALTER TABLE "exercise" DROP COLUMN "category";
ALTER TABLE "scheduled_session_exercise" DROP COLUMN "category";

-- Le type n'est plus référencé par aucune colonne.
DROP TYPE "ExerciseCategory";
