-- Un message peut porter un fichier joint — un PDF aujourd'hui (#771). Ajout seul d'une valeur :
-- aucune ligne existante n'est touchée, et la migration ne s'en sert pas elle-même.

BEGIN;

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'FILE';

COMMIT;
