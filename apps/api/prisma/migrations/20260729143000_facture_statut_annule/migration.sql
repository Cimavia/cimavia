-- AlterEnum
-- Ajout seul d'une valeur : sûr dans la transaction de `migrate deploy` (PG >= 12), tant que la
-- migration ne s'en sert pas elle-même. Aucune ligne existante n'est touchée.
ALTER TYPE "InvoiceStatus" ADD VALUE 'CANCELLED';
