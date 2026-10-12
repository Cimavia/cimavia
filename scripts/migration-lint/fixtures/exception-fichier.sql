-- `squawk-ignore-file` sans règle tairait tout le fichier, destructif compris : refusé, où que
-- squawk le lise — en tête de ligne, dans un bloc, ou après une instruction.
-- ✗ exception-sans-regle
-- squawk-ignore-file -- tout le fichier
BEGIN;
-- ✗ exception-sans-regle
/* squawk-ignore-file */
-- ✗ exception-sans-regle
ALTER TABLE "exercise" DROP COLUMN "description"; -- squawk-ignore-file
COMMIT;
