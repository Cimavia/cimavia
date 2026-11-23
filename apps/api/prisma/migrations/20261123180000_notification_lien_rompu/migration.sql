-- Prévenir l'autre partie d'un lien rompu (#909) : un type par côté, et le lien pour entité. Les
-- nouvelles valeurs d'enum ne sont utilisées par aucune instruction de cette transaction.

BEGIN;

ALTER TYPE "NotificationType" ADD VALUE 'RELATION_ENDED_BY_ATHLETE';

ALTER TYPE "NotificationType" ADD VALUE 'RELATION_ENDED_BY_COACH';

ALTER TYPE "NotificationEntityType" ADD VALUE 'COACH_ATHLETE';

COMMIT;
