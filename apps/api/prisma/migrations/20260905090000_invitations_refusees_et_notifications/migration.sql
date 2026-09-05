-- AlterEnum
-- Ajout seul de valeurs : sûr dans la transaction de `migrate deploy` (PG >= 12), tant que la
-- migration ne s'en sert pas elle-même. Aucune ligne existante n'est touchée.
ALTER TYPE "InvitationStatus" ADD VALUE 'DECLINED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INVITATION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'INVITATION_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'INVITATION_DECLINED';

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE 'INVITATION';
