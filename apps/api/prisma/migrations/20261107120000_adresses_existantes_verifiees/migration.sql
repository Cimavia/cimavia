-- La vérification d'adresse devient obligatoire pour se connecter (#270). Les comptes déjà là se
-- connectent sans elle depuis leur création — le Coach bêta et ses Athletes en tête : ils sont
-- marqués vérifiés, plutôt que de recevoir un lien à leur prochaine connexion. Better Auth ne
-- relit pas `emailVerified` sur une session déjà ouverte, et exiger la vérification n'aurait
-- atteint personne sans révoquer toutes les sessions de la bêta. Données seules : le schéma ne
-- change pas.

BEGIN;

UPDATE "user" SET "emailVerified" = true WHERE "emailVerified" = false;

COMMIT;
