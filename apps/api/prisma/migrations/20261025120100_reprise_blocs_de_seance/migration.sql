-- Reprise des séances dans les blocs de séance (#716).
--
-- Migration de DONNÉES seule : les tables viennent de `20261025120000_blocs_de_seance`. L'ancien
-- modèle reste en place et intact — `blocks`, `baseline`, `adjustments`, `tracking` —, son retrait
-- est #723.
--
-- Chaque couple (exercice de séance, ancien bloc) devient un bloc de séance :
--   - Séries et Circuit → « Séries » : à son rythme, N tours, le repos entre les tours ;
--   - EMOM → un bip toutes les N s, autant de bips que l'ancien EMOM en donnait ;
--   - AMRAP → autant que possible pendant la durée ; l'objectif de tours, qui n'a plus de champ,
--     passe dans la consigne du bloc (« Objectif : 5 tours ») ;
--   - Libre → une seule fois.
-- Un Circuit, un Libre ou un AMRAP à plusieurs lignes donne UNE ENTRÉE PAR ÉTAPE : le bloc porte
-- autant de fois l'exercice, une ligne chacun. Un exercice sans ancien bloc devient un bloc
-- « Libre » à grille vide, plutôt que de disparaître.
--
-- Ce que le nouveau modèle n'a plus, et qui ne se reprend donc pas : le repli des colonnes
-- (`collapsed`), les marqueurs d'ajustement (les valeurs se comparent, `plannedChanges`), une
-- valeur dont la colonne n'existe plus. Ce qu'il borne autrement se ramène dans ses bornes : un
-- repos de 0 s n'est plus un repos (`null`), une durée tient entre 1 s et 3 h, un nombre de tours
-- entre 1 et 99, et une grille de Séries ou d'EMOM n'a pas plus de lignes que de tours.
--
-- La première entrée REPREND la ligne d'origine, qui garde ainsi son identifiant, son suivi
-- d'ancien modèle, ses documents et ses tags. Les suivantes sont des lignes neuves, rangées après
-- les autres ; la note ne va qu'à la première. Une ligne planifiée neuve recopie les documents et
-- les tags de l'originale, et sa consigne cite les copies de ses images.
--
-- Côté planifié, chaque exercice repris est REÇU : l'ancienne donnée ne dit pas ce qui a été
-- ajouté, et le déduire contredirait l'origine portée par la donnée. Le bloc reçu (`baseline`) se
-- construit depuis l'ancienne référence de la ligne, et le suivi coché se réindexe sur les cases
-- du nouveau bloc.
--
-- Les métriques suggérées d'un exercice sont l'union ordonnée des colonnes de ses anciens blocs.
--
-- Rejouable : seules les lignes encore sans bloc (`blockId` nul) et les exercices sans métrique
-- suggérée sont repris. Décisions et chiffres de l'inventaire : `docs/dette/seances-et-exercices.md`,
-- « Tranché en #716 ».

BEGIN;

-- ── Les traductions, en fonctions temporaires de la session ─────────────────────────────────

-- Une durée de réglage : de 1 s à 3 h.
CREATE FUNCTION pg_temp.cmv_duration(seconds int) RETURNS int
  LANGUAGE sql IMMUTABLE AS $$ SELECT LEAST(GREATEST(seconds, 1), 10800) $$;

-- Un repos : nul, ou de 1 s à 3 h. Un repos de 0 s n'en est pas un.
CREATE FUNCTION pg_temp.cmv_rest(seconds int) RETURNS int
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN seconds IS NULL OR seconds <= 0 THEN NULL ELSE LEAST(seconds, 10800) END
  $$;

-- Un nombre de tours, de séries ou de bips : de 1 à 99.
CREATE FUNCTION pg_temp.cmv_rounds(count int) RETURNS int
  LANGUAGE sql IMMUTABLE AS $$ SELECT LEAST(GREATEST(count, 1), 99) $$;

-- Les réglages (`StructureSettings` de @cmv/shared) que donne une ancienne structure.
CREATE FUNCTION pg_temp.cmv_settings(structure jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_build_object(
      'restBetweenExercisesSeconds', NULL,
      'limitSeconds', NULL,
      'order', 'ALL'
    ) || CASE structure->>'type'
      WHEN 'SERIES' THEN jsonb_build_object(
        'advance', jsonb_build_object('kind', 'ATHLETE'),
        'repeat', jsonb_build_object(
          'kind', 'ROUNDS', 'rounds', pg_temp.cmv_rounds((structure->>'setCount')::int)),
        'restBetweenRoundsSeconds',
        pg_temp.cmv_rest((structure->>'restBetweenSetsSeconds')::int))
      WHEN 'CIRCUIT' THEN jsonb_build_object(
        'advance', jsonb_build_object('kind', 'ATHLETE'),
        'repeat', jsonb_build_object(
          'kind', 'ROUNDS', 'rounds', pg_temp.cmv_rounds((structure->>'roundCount')::int)),
        'restBetweenRoundsSeconds',
        pg_temp.cmv_rest((structure->>'restBetweenRoundsSeconds')::int))
      WHEN 'EMOM' THEN jsonb_build_object(
        'advance', jsonb_build_object(
          'kind', 'BEEP',
          'everySeconds', pg_temp.cmv_duration((structure->>'intervalSeconds')::int)),
        'repeat', jsonb_build_object(
          'kind', 'ROUNDS',
          'rounds', pg_temp.cmv_rounds(
            (structure->>'totalDurationSeconds')::int / (structure->>'intervalSeconds')::int)),
        'restBetweenRoundsSeconds', NULL)
      WHEN 'AMRAP' THEN jsonb_build_object(
        'advance', jsonb_build_object('kind', 'ATHLETE'),
        'repeat', jsonb_build_object(
          'kind', 'MAX',
          'capSeconds', pg_temp.cmv_duration((structure->>'totalDurationSeconds')::int)),
        'restBetweenRoundsSeconds', NULL)
      ELSE jsonb_build_object(
        'advance', jsonb_build_object('kind', 'ATHLETE'),
        'repeat', jsonb_build_object('kind', 'ONCE'),
        'restBetweenRoundsSeconds', NULL)
    END
  $$;

-- La structure prête d'où le bloc vient : Séries et Circuit sont fusionnés.
CREATE FUNCTION pg_temp.cmv_preset(structure jsonb) RETURNS "StructurePreset"
  LANGUAGE sql IMMUTABLE AS $$
    SELECT (CASE structure->>'type'
      WHEN 'SERIES' THEN 'SERIES' WHEN 'CIRCUIT' THEN 'SERIES'
      WHEN 'EMOM' THEN 'EMOM' WHEN 'AMRAP' THEN 'AMRAP'
      ELSE 'FREE' END)::"StructurePreset"
  $$;

-- Son nom, tel que le Coach francophone le lit (`block.preset.*`).
CREATE FUNCTION pg_temp.cmv_name(structure jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE structure->>'type'
      WHEN 'SERIES' THEN 'Séries' WHEN 'CIRCUIT' THEN 'Séries'
      WHEN 'EMOM' THEN 'EMOM' WHEN 'AMRAP' THEN 'AMRAP'
      ELSE 'Libre' END
  $$;

-- La consigne : l'objectif d'un AMRAP, seul paramètre sans champ dans le nouveau modèle.
CREATE FUNCTION pg_temp.cmv_instructions(structure jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN structure->>'type' = 'AMRAP' AND structure->>'targetRounds' IS NOT NULL
      THEN 'Objectif : ' || (structure->>'targetRounds')
        || CASE WHEN (structure->>'targetRounds')::int = 1 THEN ' tour' ELSE ' tours' END
    END
  $$;

-- La grille (`BlockGrid`) : les colonnes sans repli et au libellé taillé, les lignes sans valeur
-- vide ni valeur d'une colonne disparue.
CREATE FUNCTION pg_temp.cmv_grid(metrics jsonb, grid_rows jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_build_object(
      'metrics', COALESCE((
        SELECT jsonb_agg(
          (m - 'collapsed' - 'label') || jsonb_build_object('label', NULLIF(btrim(m->>'label'), ''))
          ORDER BY i)
        FROM jsonb_array_elements(metrics) WITH ORDINALITY AS c(m, i)), '[]'::jsonb),
      'rows', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('id', r->>'id', 'values', COALESCE((
            SELECT jsonb_object_agg(v.key, v.value)
            FROM jsonb_each(r->'values') AS v
            WHERE v.value <> 'null'::jsonb
              AND v.key IN (SELECT m->>'id' FROM jsonb_array_elements(metrics) AS k(m))),
            '{}'::jsonb))
          ORDER BY i)
        FROM jsonb_array_elements(grid_rows) WITH ORDINALITY AS l(r, i)), '[]'::jsonb))
  $$;

-- Les entrées d'un ancien bloc : une par étape pour un Circuit, un Libre ou un AMRAP qui a des
-- lignes ; sinon une seule, aux lignes bornées par le nombre de tours de ses réglages.
CREATE FUNCTION pg_temp.cmv_entries(block jsonb) RETURNS TABLE (step int, grid jsonb)
  LANGUAGE sql IMMUTABLE AS $$
    SELECT (i - 1)::int, pg_temp.cmv_grid(block->'metrics', jsonb_build_array(r))
    FROM jsonb_array_elements(block->'rows') WITH ORDINALITY AS l(r, i)
    WHERE block->'structure'->>'type' IN ('CIRCUIT', 'FREE', 'AMRAP')
    UNION ALL
    SELECT 0, pg_temp.cmv_grid(block->'metrics', COALESCE((
      SELECT jsonb_agg(r ORDER BY i)
      FROM jsonb_array_elements(block->'rows') WITH ORDINALITY AS l(r, i)
      WHERE i <= COALESCE(
        (pg_temp.cmv_settings(block->'structure')->'repeat'->>'rounds')::int, 1)), '[]'::jsonb))
    WHERE block->'structure'->>'type' NOT IN ('CIRCUIT', 'FREE', 'AMRAP')
       OR jsonb_array_length(block->'rows') = 0
    ORDER BY 1
  $$;

-- Le suivi d'un ancien bloc (`{checked: [i…]}` ou `{rounds: n}`), sur les cases du nouveau
-- (`blockChecks`) : une coche par série, bip ou tour pour chaque exercice qui y passe, par
-- exercice pour « une seule fois », « Bloc fait » pour un AMRAP qui a compté au moins un tour.
-- Une case que le nouveau bloc n'a pas est laissée.
CREATE FUNCTION pg_temp.cmv_checks(structure jsonb, state jsonb, exercise_keys text[]) RETURNS jsonb
  LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_build_object('checked', COALESCE((
      SELECT jsonb_agg(c ORDER BY (c->>'row')::int, c->>'key')
      FROM (
        SELECT jsonb_build_object('row', 0, 'key', NULL) AS c
        WHERE structure->>'type' = 'AMRAP' AND COALESCE((state->>'rounds')::int, 0) > 0
        UNION ALL
        SELECT jsonb_build_object('row', 0, 'key', exercise_keys[u + 1])
        FROM jsonb_array_elements_text(COALESCE(state->'checked', '[]'::jsonb)) AS t(raw),
             LATERAL (SELECT raw::int AS u) AS unit
        WHERE structure->>'type' = 'FREE' AND u < cardinality(exercise_keys)
        UNION ALL
        SELECT jsonb_build_object('row', u, 'key', k)
        FROM jsonb_array_elements_text(COALESCE(state->'checked', '[]'::jsonb)) AS t(raw),
             LATERAL (SELECT raw::int AS u) AS unit,
             unnest(exercise_keys) AS k
        WHERE structure->>'type' IN ('SERIES', 'EMOM', 'CIRCUIT')
          AND u < (pg_temp.cmv_settings(structure)->'repeat'->>'rounds')::int
      ) AS checks), '[]'::jsonb))
  $$;

-- Un exercice sans ancien bloc : un Libre sans colonne ni ligne.
CREATE FUNCTION pg_temp.cmv_blocks_of(blocks jsonb) RETURNS TABLE (ordinal bigint, block jsonb)
  LANGUAGE sql IMMUTABLE AS $$
    SELECT i, b FROM jsonb_array_elements(blocks) WITH ORDINALITY AS o(b, i)
    UNION ALL
    SELECT 1, jsonb_build_object(
      'id', NULL, 'label', NULL, 'structure', jsonb_build_object('type', 'FREE'),
      'metrics', '[]'::jsonb, 'rows', '[]'::jsonb)
    WHERE jsonb_array_length(blocks) = 0
    ORDER BY 1
  $$;

-- ── Les métriques suggérées des exercices ───────────────────────────────────────────────────

UPDATE "exercise" AS e
SET "suggestedMetrics" = s.metrics
FROM (
  SELECT x.id, jsonb_agg(x.metric ORDER BY x.rank) AS metrics
  FROM (
    SELECT DISTINCT ON (e2.id, identity) e2.id, identity, rank,
      CASE WHEN m->>'source' = 'CATALOG'
        THEN jsonb_build_object('source', 'CATALOG', 'key', m->'key', 'unit', m->'unit')
        ELSE jsonb_build_object('source', 'CUSTOM', 'customMetricId', m->'customMetricId')
      END AS metric
    FROM "exercise" AS e2
    CROSS JOIN LATERAL jsonb_array_elements(e2.blocks) WITH ORDINALITY AS b(block, bi)
    CROSS JOIN LATERAL jsonb_array_elements(block->'metrics') WITH ORDINALITY AS c(m, mi)
    CROSS JOIN LATERAL (
      -- Même identité que `suggestedMetricsSchema` : la clé du catalogue, ou la métrique du Coach.
      SELECT (m->>'source') || ':' || COALESCE(m->>'key', m->>'customMetricId') AS identity,
        bi * 1000 + mi AS rank
    ) AS k
    ORDER BY e2.id, identity, rank
  ) AS x
  GROUP BY x.id
) AS s
WHERE e.id = s.id
  AND e."suggestedMetrics" = '[]'::jsonb;

-- Une suggestion se borne à 12 colonnes, comme une grille.
UPDATE "exercise"
SET "suggestedMetrics" = (
  SELECT jsonb_agg(m ORDER BY i)
  FROM jsonb_array_elements("suggestedMetrics") WITH ORDINALITY AS t(m, i)
  WHERE i <= 12)
WHERE jsonb_array_length("suggestedMetrics") > 12;

-- ── Les séances-types ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  line record;
  old record;
  entry record;
  block_id text;
  first_entry boolean;
  rank int;
BEGIN
  FOR line IN
    SELECT * FROM "session_exercise" WHERE "blockId" IS NULL ORDER BY "sessionId", "position"
  LOOP
    first_entry := true;
    FOR old IN SELECT * FROM pg_temp.cmv_blocks_of(line.blocks) LOOP
      block_id := gen_random_uuid()::text;
      INSERT INTO "session_block" (
        "id", "coachId", "sessionId", "position", "name", "label", "instructions",
        "settings", "copiedSettings", "sourcePreset")
      SELECT block_id, line."coachId", line."sessionId",
        COALESCE(max(sb."position") + 1, 0),
        pg_temp.cmv_name(old.block->'structure'),
        NULLIF(btrim(old.block->>'label'), ''),
        pg_temp.cmv_instructions(old.block->'structure'),
        pg_temp.cmv_settings(old.block->'structure'),
        pg_temp.cmv_settings(old.block->'structure'),
        pg_temp.cmv_preset(old.block->'structure')
      FROM "session_block" AS sb WHERE sb."sessionId" = line."sessionId";

      rank := 0;
      FOR entry IN SELECT * FROM pg_temp.cmv_entries(old.block) LOOP
        IF first_entry THEN
          UPDATE "session_exercise"
          SET "blockId" = block_id, "blockPosition" = rank,
              "key" = gen_random_uuid()::text, "grid" = entry.grid
          WHERE "id" = line."id";
          first_entry := false;
        ELSE
          INSERT INTO "session_exercise" (
            "id", "coachId", "sessionId", "exerciseId", "position",
            "blockId", "blockPosition", "key", "grid")
          SELECT gen_random_uuid()::text, line."coachId", line."sessionId", line."exerciseId",
            max(se."position") + 1, block_id, rank, gen_random_uuid()::text, entry.grid
          FROM "session_exercise" AS se WHERE se."sessionId" = line."sessionId";
        END IF;
        rank := rank + 1;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ── Les séances planifiées ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  line record;
  old record;
  received jsonb;
  entry record;
  document record;
  block_id text;
  row_id text;
  copy_id text;
  instructions_text text;
  keys text[];
  grids jsonb[];
  baseline_grids jsonb[];
  first_entry boolean;
  rank int;
BEGIN
  FOR line IN
    SELECT * FROM "scheduled_session_exercise"
    WHERE "blockId" IS NULL ORDER BY "scheduledSessionId", "position"
  LOOP
    first_entry := true;
    FOR old IN SELECT * FROM pg_temp.cmv_blocks_of(line.blocks) LOOP
      -- L'ancien bloc tel que la ligne l'a reçu : même identifiant dans la référence.
      received := COALESCE(
        (SELECT b FROM jsonb_array_elements(line.baseline) AS r(b) WHERE b->>'id' = old.block->>'id'),
        old.block);
      SELECT array_agg(gen_random_uuid()::text ORDER BY step), array_agg(grid ORDER BY step)
        INTO keys, grids
        FROM pg_temp.cmv_entries(old.block);
      SELECT array_agg(grid ORDER BY step) INTO baseline_grids FROM pg_temp.cmv_entries(received);

      block_id := gen_random_uuid()::text;
      INSERT INTO "scheduled_session_block" (
        "id", "coachId", "athleteId", "scheduledSessionId", "position", "name", "label",
        "instructions", "settings", "copiedSettings", "sourcePreset", "baseline", "tracking")
      SELECT block_id, line."coachId", line."athleteId", line."scheduledSessionId",
        COALESCE(max(sb."position") + 1, 0),
        pg_temp.cmv_name(old.block->'structure'),
        NULLIF(btrim(old.block->>'label'), ''),
        pg_temp.cmv_instructions(old.block->'structure'),
        pg_temp.cmv_settings(old.block->'structure'),
        pg_temp.cmv_settings(received->'structure'),
        pg_temp.cmv_preset(old.block->'structure'),
        jsonb_build_object(
          'settings', pg_temp.cmv_settings(received->'structure'),
          'exercises', (
            SELECT jsonb_agg(jsonb_build_object(
              'key', keys[i],
              'exerciseId', line."sourceExerciseId",
              'note', CASE WHEN first_entry AND i = 1 THEN line.note END,
              -- Une étape que la référence n'a pas reçue garde sa propre grille.
              'grid', COALESCE(baseline_grids[i], grids[i])) ORDER BY i)
            FROM generate_subscripts(keys, 1) AS i)),
        CASE WHEN line.tracking IS NULL OR old.block->>'id' IS NULL THEN NULL
          ELSE pg_temp.cmv_checks(old.block->'structure', line.tracking->(old.block->>'id'), keys)
        END
      FROM "scheduled_session_block" AS sb
      WHERE sb."scheduledSessionId" = line."scheduledSessionId";

      rank := 0;
      FOR entry IN SELECT * FROM pg_temp.cmv_entries(old.block) LOOP
        IF first_entry THEN
          UPDATE "scheduled_session_exercise"
          SET "blockId" = block_id, "blockPosition" = rank, "key" = keys[rank + 1],
              "grid" = entry.grid, "origin" = 'RECEIVED'
          WHERE "id" = line."id";
          first_entry := false;
        ELSE
          row_id := gen_random_uuid()::text;
          INSERT INTO "scheduled_session_exercise" (
            "id", "coachId", "athleteId", "scheduledSessionId", "sourceExerciseId", "title",
            "description", "instructions", "customMetrics", "position",
            "blockId", "blockPosition", "key", "grid", "origin")
          SELECT row_id, line."coachId", line."athleteId", line."scheduledSessionId",
            line."sourceExerciseId", line.title, line.description, line.instructions,
            line."customMetrics", max(sse."position") + 1,
            block_id, rank, keys[rank + 1], entry.grid, 'RECEIVED'
          FROM "scheduled_session_exercise" AS sse
          WHERE sse."scheduledSessionId" = line."scheduledSessionId";

          INSERT INTO "scheduled_session_exercise_tag" (
            "id", "coachId", "athleteId", "scheduledSessionExerciseId", "name")
          SELECT gen_random_uuid()::text, t."coachId", t."athleteId", row_id, t.name
          FROM "scheduled_session_exercise_tag" AS t
          WHERE t."scheduledSessionExerciseId" = line."id";

          -- Une copie partage la clé objet de l'original, et la consigne cite ses images par
          -- l'identifiant du document de SA ligne : chaque copie y remplace son original.
          instructions_text := line.instructions::text;
          FOR document IN
            SELECT * FROM "scheduled_session_exercise_document"
            WHERE "scheduledSessionExerciseId" = line."id"
          LOOP
            copy_id := gen_random_uuid()::text;
            INSERT INTO "scheduled_session_exercise_document" (
              "id", "coachId", "athleteId", "scheduledSessionExerciseId", "type", "usage",
              "storagePath", "url", "fileName", "mimeType", "createdAt")
            VALUES (copy_id, document."coachId", document."athleteId", row_id, document.type,
              document.usage, document."storagePath", document.url, document."fileName",
              document."mimeType", document."createdAt");
            instructions_text := replace(instructions_text,
              '"mediaId": "' || document.id || '"', '"mediaId": "' || copy_id || '"');
          END LOOP;
          UPDATE "scheduled_session_exercise"
          SET "instructions" = instructions_text::jsonb
          WHERE "id" = row_id AND instructions_text IS NOT NULL;
        END IF;
        rank := rank + 1;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
