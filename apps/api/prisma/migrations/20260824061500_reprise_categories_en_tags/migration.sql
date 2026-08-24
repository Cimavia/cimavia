-- Reprise des catégories existantes en tags (#162).
--
-- Migration de DONNÉES seule : aucun changement de schéma. `category` reste en place et
-- alimentée — son retrait est une étape ultérieure, une fois les surfaces basculées.
--
-- Le nom du tag est la catégorie en minuscules : RENFO → « renfo ». C'est la forme normalisée
-- par `exerciseTagSchema`, sans quoi l'autocomplétion proposerait « RENFO » et « renfo » comme
-- deux entrées distinctes.
--
-- `ON CONFLICT DO NOTHING` rend la reprise rejouable : la relancer sur une base déjà migrée ne
-- crée pas de doublon et ne lève pas d'erreur.

INSERT INTO "exercise_tag" ("id", "coachId", "exerciseId", "name", "createdAt")
SELECT gen_random_uuid()::text, e."coachId", e."id", lower(e."category"::text), NOW()
FROM "exercise" e
ON CONFLICT ("exerciseId", "name") DO NOTHING;

-- Le snapshot d'une planif diffusée reçoit la même reprise : son affichage ne doit jamais
-- dépendre de l'exercice source.
INSERT INTO "scheduled_session_exercise_tag" (
  "id", "coachId", "athleteId", "scheduledSessionExerciseId", "name", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  s."coachId",
  s."athleteId",
  s."id",
  lower(s."category"::text),
  NOW()
FROM "scheduled_session_exercise" s
ON CONFLICT ("scheduledSessionExerciseId", "name") DO NOTHING;
