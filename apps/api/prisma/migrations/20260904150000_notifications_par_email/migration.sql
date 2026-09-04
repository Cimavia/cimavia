-- Notifications par e-mail (#65) — opt-in : une ligne par type ACTIVÉ, l'absence vaut désactivé.
CREATE TABLE "notification_email_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_email_preference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_email_preference_userId_idx" ON "notification_email_preference"("userId");

-- Un type n'est activé qu'une fois : rend idempotent le remplacement de l'ensemble.
CREATE UNIQUE INDEX "notification_email_preference_userId_type_key" ON "notification_email_preference"("userId", "type");

ALTER TABLE "notification_email_preference" ADD CONSTRAINT "notification_email_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
