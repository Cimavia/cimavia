-- Retirer une valeur d'enum : Prisma enveloppe déjà ce bloc dans SON `BEGIN;` … `COMMIT;`. Dans
-- une migration atomique, ce COMMIT intérieur validerait tout ce qui précède : à retirer. squawk
-- signale le BEGIN imbriqué, puis le COMMIT extérieur, qui ne ferme plus rien.
BEGIN;

-- ✗ transaction-nesting
BEGIN;
CREATE TYPE "Status_new" AS ENUM ('DRAFT', 'DONE');
-- ✗ changing-column-type
ALTER TABLE "plan" ALTER COLUMN "status" TYPE "Status_new" USING ("status"::text::"Status_new");
-- ✗ ban-drop-type
DROP TYPE "Status";
COMMIT;

-- ✗ transaction-nesting
COMMIT;
