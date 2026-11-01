-- Retrait de l'ancien modèle d'exercice structuré (#723, épic #714) : phase CONTRACT.
--
-- Une séance se compose par blocs depuis #716, et la reprise `20261025120100_reprise_blocs_de_seance`
-- y a rangé chaque exercice. Tombent ici les colonnes de l'ancien modèle — le dosage porté par
-- l'exercice (`blocks`), sa référence et ses marqueurs d'ajustement (`baseline`, `adjustments`,
-- `baselineAdjustments`) et le suivi par exercice (`tracking`) —, et le placement dans un bloc
-- devient obligatoire.
--
-- La garde d'abord : une ligne sans bloc aurait été écrite par l'ancien modèle APRÈS la reprise.
-- Plutôt que de la perdre avec ses colonnes, la migration s'arrête et le dit ; rejouer la reprise
-- (elle est rejouable) la range, et la migration repasse. Décision : `docs/dette/seances-et-exercices.md`,
-- « Tranché en #723 ».

BEGIN;

DO $$
DECLARE
  orphans int;
BEGIN
  SELECT (SELECT count(*) FROM "session_exercise" WHERE "blockId" IS NULL)
       + (SELECT count(*) FROM "scheduled_session_exercise" WHERE "blockId" IS NULL)
    INTO orphans;
  IF orphans > 0 THEN
    RAISE EXCEPTION '% exercice(s) de séance sans bloc : rejouer 20261025120100_reprise_blocs_de_seance avant ce retrait (#723).', orphans;
  END IF;
END $$;

-- Le placement complet est désormais porté par NOT NULL ; seule reste la règle du remplaçant.
ALTER TABLE "session_exercise" DROP CONSTRAINT "session_exercise_block_placement";

ALTER TABLE "scheduled_session_exercise" DROP CONSTRAINT "scheduled_session_exercise_block_placement";

ALTER TABLE "scheduled_session_exercise" ADD CONSTRAINT "scheduled_session_exercise_replaces_key" CHECK (
  ("origin" = 'REPLACEMENT') = ("replacesKey" IS NOT NULL)
);

-- squawk-ignore ban-drop-column -- le dosage vit dans la grille du bloc depuis la reprise (#716)
ALTER TABLE "exercise" DROP COLUMN "blocks";

-- squawk-ignore ban-drop-column -- repris dans les blocs de séance, grilles comprises (#716)
ALTER TABLE "session_exercise" DROP COLUMN "adjustments";

-- squawk-ignore ban-drop-column -- repris dans les blocs de séance, grilles comprises (#716)
ALTER TABLE "session_exercise" DROP COLUMN "baseline";

-- squawk-ignore ban-drop-column -- repris dans les blocs de séance, grilles comprises (#716)
ALTER TABLE "session_exercise" DROP COLUMN "blocks";

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "session_exercise" ALTER COLUMN "blockId" SET NOT NULL;

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "session_exercise" ALTER COLUMN "blockPosition" SET NOT NULL;

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "session_exercise" ALTER COLUMN "key" SET NOT NULL;

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "session_exercise" ALTER COLUMN "grid" SET NOT NULL;

-- squawk-ignore ban-drop-column -- repris dans les blocs planifiés, référence et suivi compris (#716)
ALTER TABLE "scheduled_session_exercise" DROP COLUMN "adjustments";

-- squawk-ignore ban-drop-column -- repris dans les blocs planifiés, référence et suivi compris (#716)
ALTER TABLE "scheduled_session_exercise" DROP COLUMN "baseline";

-- squawk-ignore ban-drop-column -- repris dans les blocs planifiés, référence et suivi compris (#716)
ALTER TABLE "scheduled_session_exercise" DROP COLUMN "baselineAdjustments";

-- squawk-ignore ban-drop-column -- repris dans les blocs planifiés, référence et suivi compris (#716)
ALTER TABLE "scheduled_session_exercise" DROP COLUMN "blocks";

-- squawk-ignore ban-drop-column -- repris dans les blocs planifiés, référence et suivi compris (#716)
ALTER TABLE "scheduled_session_exercise" DROP COLUMN "tracking";

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "scheduled_session_exercise" ALTER COLUMN "blockId" SET NOT NULL;

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "scheduled_session_exercise" ALTER COLUMN "blockPosition" SET NOT NULL;

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "scheduled_session_exercise" ALTER COLUMN "key" SET NOT NULL;

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "scheduled_session_exercise" ALTER COLUMN "grid" SET NOT NULL;

-- squawk-ignore adding-not-nullable-field -- la garde ci-dessus vérifie que chaque ligne a son bloc
ALTER TABLE "scheduled_session_exercise" ALTER COLUMN "origin" SET NOT NULL;

COMMIT;
