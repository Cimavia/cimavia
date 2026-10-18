-- La copie figée d'un exercice perdu (#609).
--
-- Quand C supprime un exercice qu'une séance de M cite, ou en ferme l'accès à M, la séance de M
-- garde une copie de l'exercice, que M possède. La copie dit d'où elle vient : le Coach d'origine
-- et la date. Toutes les lignes existantes sont des exercices ordinaires : `NULL` les décrit.
--
-- `SET NULL` à la suppression du compte d'origine : la copie survit à son auteur. `frozenAt`
-- reste, et c'est lui seul qui dit qu'il s'agit d'une copie — d'où le CHECK, qui interdit une
-- provenance sans date.

BEGIN;

ALTER TABLE "exercise" ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "frozenFromCoachId" TEXT;

ALTER TABLE "exercise" ADD CONSTRAINT "exercise_frozen_from_dated" CHECK ("frozenFromCoachId" IS NULL OR "frozenAt" IS NOT NULL);

CREATE INDEX "exercise_frozenFromCoachId_idx" ON "exercise"("frozenFromCoachId");

ALTER TABLE "exercise" ADD CONSTRAINT "exercise_frozenFromCoachId_fkey" FOREIGN KEY ("frozenFromCoachId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
