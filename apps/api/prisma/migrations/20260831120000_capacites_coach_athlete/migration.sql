-- Capacités cumulables isCoach / isAthlete (#9).
--
-- Purement additif. `role` n'est PAS supprimé : il survit comme persona d'AFFICHAGE (sur quel
-- univers atterrit un compte à double capacité) et ne fonde plus aucun droit. Une colonne, un
-- seul sens — c'est ce qui évite d'avoir deux lectures concurrentes de la même donnée.
--
-- DEFAULT false plutôt que NULL, contrairement à l'habitude nullable (règle dure n°5) : une
-- capacité absente n'est pas « indisponible », c'est « pas cette capacité ». Le fail closed de
-- `capabilitiesOf()` dit déjà la même chose côté code — un compte dont on ne sait rien n'ouvre
-- rien. Un NULL ici n'ajouterait qu'un troisième état sans signification métier.

ALTER TABLE "user" ADD COLUMN "isCoach" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN "isAthlete" BOOLEAN NOT NULL DEFAULT false;

-- Peuplement des comptes existants depuis le rôle exclusif. ADMIN (jamais attribué à ce jour,
-- cf. #3) ne reçoit AUCUNE capacité : le back-office aura les siennes, et lui en accorder une
-- par défaut ouvrirait un droit que personne n'a décidé.
--
-- Rejouable : les deux UPDATE sont idempotents, et un compte créé après cette migration reçoit
-- ses capacités du `databaseHook` create.before plutôt que d'ici.

UPDATE "user" SET "isCoach" = true WHERE "role" = 'COACH';
UPDATE "user" SET "isAthlete" = true WHERE "role" = 'ATHLETE';
