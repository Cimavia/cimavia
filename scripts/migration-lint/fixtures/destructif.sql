-- Ce qui perd des données, ou fait échouer la migration sur des lignes existantes : chaque
-- instruction doit être signalée par la règle marquée au-dessus d'elle, atomique ou non.
BEGIN;

-- ✗ ban-drop-column
ALTER TABLE "exercise" DROP COLUMN "description";

-- ✗ ban-drop-table
DROP TABLE "legacy_note";

-- ✗ ban-drop-type
DROP TYPE "ExerciseCategory";

-- ✗ ban-truncate-cascade
TRUNCATE "notification" CASCADE;

-- ✗ changing-column-type
ALTER TABLE "invoice" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- ✗ adding-required-field
ALTER TABLE "invoice" ADD COLUMN "currency" TEXT NOT NULL;

-- ✗ adding-not-nullable-field
ALTER TABLE "invoice" ALTER COLUMN "athleteId" SET NOT NULL;

COMMIT;
