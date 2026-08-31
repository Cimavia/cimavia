-- Reprise des descriptions existantes en consigne structurée (#162).
--
-- Migration de DONNÉES seule : aucun changement de schéma. `description` reste en place et
-- alimentée — son retrait est une étape ultérieure, une fois les surfaces basculées (dette R-1).
--
-- Chaque description non nulle devient UN unique bloc paragraphe. Pas de parsing : la base ne
-- contient que des données de test d'une dizaine de caractères, et deviner des titres ou des
-- listes dans du texte libre produirait des faux positifs pour zéro valeur. Décision et son
-- contexte chiffré dans `docs/dette-technique.md` § « Refonte du modèle d'exercice ».
--
-- La forme produite est exactement celle de `richDocumentFromPlainText` (@cmv/shared) :
--   [{ "type": "PARAGRAPH", "content": [{ "text": "…" }] }]
-- `marks` et `href` sont facultatifs et absents ici — les omettre, plutôt que d'écrire des
-- tableaux vides, garde le document identique à ce que produirait le code.
--
-- `btrim` + le filtre `<> ''` appliquent la règle nullable (n°5) : une description faite d'espaces
-- ne donne PAS un paragraphe vide, elle laisse `instructions` à NULL.
--
-- `WHERE instructions IS NULL` rend la reprise rejouable et non destructrice : la relancer
-- n'écrase jamais une consigne déjà écrite par un coach.

UPDATE "exercise"
SET "instructions" = jsonb_build_array(
  jsonb_build_object(
    'type', 'PARAGRAPH',
    'content', jsonb_build_array(jsonb_build_object('text', btrim("description")))
  )
)
WHERE "instructions" IS NULL
  AND "description" IS NOT NULL
  AND btrim("description") <> '';

-- Le snapshot d'une planif diffusée reçoit la même reprise : son affichage ne doit jamais
-- dépendre de l'exercice source (décision structurante P3).
UPDATE "scheduled_session_exercise"
SET "instructions" = jsonb_build_array(
  jsonb_build_object(
    'type', 'PARAGRAPH',
    'content', jsonb_build_array(jsonb_build_object('text', btrim("description")))
  )
)
WHERE "instructions" IS NULL
  AND "description" IS NOT NULL
  AND btrim("description") <> '';
