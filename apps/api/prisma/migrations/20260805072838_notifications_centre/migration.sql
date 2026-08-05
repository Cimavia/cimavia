-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PLAN_PUBLISHED', 'PLAN_UPDATED', 'FEEDBACK_RECEIVED', 'MESSAGE_RECEIVED', 'INVOICE_ISSUED');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('PLAN', 'SCHEDULED_SESSION', 'CONVERSATION', 'INVOICE');

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "entityType" "NotificationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorName" TEXT,
    "subjectLabel" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_recipientId_createdAt_idx" ON "notification"("recipientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notification_recipientId_readAt_idx" ON "notification"("recipientId", "readAt");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
