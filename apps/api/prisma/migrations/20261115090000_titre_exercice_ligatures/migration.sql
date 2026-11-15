-- `comparableText` (@cmv/shared) replie désormais « œ » et « æ » en « oe » et « ae » (#358). Les
-- lignes déjà en base les portent encore : sans cette reprise, « Nœud de huit » ne serait plus
-- trouvé par personne, pas même par « nœud ». Données seules : le schéma ne change pas.
--
-- Le remplacement porte sur `titleSearch`, sans le recalculer depuis `title` : seules les
-- ligatures changent de règle. « Œ » et « Æ » sont repris aussi : la reprise de #141 passait par
-- `lower()`, qui dépend de la locale de CHAQUE base — vérifiée en local, pas sur le NAS.
-- Raisonnement complet : `docs/dette/seances-et-exercices.md`, « Tranché en #358 ».

BEGIN;

UPDATE "exercise"
SET "titleSearch" = replace(replace(replace(replace("titleSearch", 'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae')
WHERE "titleSearch" ~ '[œŒæÆ]';

COMMIT;
