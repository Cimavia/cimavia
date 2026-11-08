-- Supprimer son compte (#256). Deux changements, écrits avant le service qui s'en sert.
--
-- Une facture émise reste au coach quand l'athlète part : `athleteId` perd sa clé étrangère, et le
-- nom de l'athlète est figé au moment où il supprime son compte. La file `pending_object_deletion`
-- s'écrit dans la transaction de l'effacement : le stockage ne peut pas y participer.

BEGIN;

-- squawk-ignore ban-drop-constraint -- la facture doit survivre à la ligne de l'athlète (#256)
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_athleteId_fkey";

ALTER TABLE "invoice" ADD COLUMN "erasedAthleteName" TEXT;

CREATE TABLE "pending_object_deletion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_object_deletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_object_deletion_key_key" ON "pending_object_deletion"("key");

COMMIT;
