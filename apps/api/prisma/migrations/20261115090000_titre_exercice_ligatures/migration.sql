-- `comparableText` (@cmv/shared) replie désormais « œ » et « æ » en « oe » et « ae » (#358). Les
-- lignes déjà en base les portent encore : sans cette reprise, « Nœud de huit » ne serait plus
-- trouvé par personne, pas même par « nœud ». Données seules : le schéma ne change pas.
--
-- Le remplacement porte sur `titleSearch`, sans le recalculer depuis `title` : seules les
-- ligatures changent de règle. Les majuscules n'y sont plus : la colonne est déjà en minuscules,
-- écrite par le TypeScript ou reprise en #141 par `lower()` sous `en_US.utf8`.
-- Raisonnement complet : `docs/dette/seances-et-exercices.md`, « Tranché en #358 ».

BEGIN;

UPDATE "exercise"
SET "titleSearch" = replace(replace("titleSearch", 'œ', 'oe'), 'æ', 'ae')
WHERE "titleSearch" ~ '[œæ]';

COMMIT;
