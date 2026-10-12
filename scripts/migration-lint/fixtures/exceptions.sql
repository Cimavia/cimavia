-- Une opération destructive voulue se déclare au-dessus de son instruction, raison comprise.
BEGIN;

-- squawk-ignore ban-drop-column -- la consigne vit dans `instructions` depuis #163
ALTER TABLE "exercise" DROP COLUMN "description";

-- squawk-ignore ban-drop-column, ban-drop-type -- plusieurs règles, une raison
ALTER TABLE "exercise" DROP COLUMN "category";

-- La raison collée au `--`, ou dans un bloc : squawk l'admet, check:migrations aussi.
-- squawk-ignore ban-drop-column --raison collée
ALTER TABLE "exercise" DROP COLUMN "level";

/* squawk-ignore ban-drop-column -- raison dans un bloc */
ALTER TABLE "exercise" DROP COLUMN "tempo";

-- Sans raison : squawk se tait, check:migrations refuse.
-- ✗ exception-sans-raison
-- squawk-ignore ban-drop-table
DROP TABLE "legacy_note";

-- Un nom de règle mal écrit n'ignore rien : squawk le dit, et l'instruction reste signalée.
-- ✗ unused-ignore
-- squawk-ignore ban-drop-colum -- faute de frappe
-- ✗ ban-drop-column
ALTER TABLE "exercise" DROP COLUMN "notes";

COMMIT;
