-- Titre d'exercice sous sa forme comparable (#141) : `GET /exercises?search=` cesse d'exiger
-- l'accent, et se comporte enfin comme les deux champs de recherche voisins.
--
-- La normalisation vit en TypeScript, dans `comparableText` (@cmv/shared) — la MÊME fonction que
-- les recherches côté client depuis #123. Le SQL ci-dessous ne sert qu'UNE fois, à reprendre les
-- lignes déjà en base ; toute écriture ultérieure passe par `ExerciseService`. Il reproduit la
-- fonction terme à terme : `normalize(…, NFD)` déplie la lettre et son signe (natif depuis PG 13,
-- donc PAS d'extension `unaccent` — qui poserait une SECONDE définition de « sans accent », vouée
-- à diverger de celle du TypeScript), le bloc combinant U+0300–U+036F part, puis minuscules.
--
-- Pas d'index, et c'est délibéré : le filtre est un `contains`, donc un `LIKE '%x%'` qu'aucun
-- btree ne sert — un index d'expression `text_pattern_ops` ne servirait que les préfixes. Le seul
-- index utile serait un GIN `pg_trgm`, soit une extension pour des dizaines de lignes par coach,
-- déjà réduites par l'index `coachId` existant.

ALTER TABLE "exercise" ADD COLUMN "titleSearch" TEXT NOT NULL DEFAULT '';

UPDATE "exercise"
SET "titleSearch" = lower(regexp_replace(normalize(btrim("title"), NFD), '[\u0300-\u036f]', '', 'g'));

-- Le défaut n'existait que pour poser une colonne NOT NULL sur des lignes déjà là. Une écriture
-- qui oublierait le titre comparable doit ÉCHOUER, pas passer avec une chaîne vide qui ne serait
-- jamais trouvée par personne.
ALTER TABLE "exercise" ALTER COLUMN "titleSearch" DROP DEFAULT;
