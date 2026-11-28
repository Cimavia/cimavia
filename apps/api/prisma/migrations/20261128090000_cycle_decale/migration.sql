-- Prévenir l'athlète qu'un cycle diffusé a glissé dans le temps (#231) : reporté en entier, ou une
-- semaine insérée devant la suite. La nouvelle valeur n'est utilisée par aucune instruction de
-- cette transaction.

BEGIN;

ALTER TYPE "NotificationType" ADD VALUE 'PLAN_RESCHEDULED';

COMMIT;
