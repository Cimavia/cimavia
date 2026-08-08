-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReminderEntityType" AS ENUM ('PLAN', 'INVOICE');

-- CreateTable
CREATE TABLE "reminder" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "entityType" "ReminderEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_coachId_status_dueAt_idx" ON "reminder"("coachId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "reminder_coachId_status_readAt_idx" ON "reminder"("coachId", "status", "readAt");

-- CreateIndex
CREATE INDEX "reminder_entityType_entityId_idx" ON "reminder"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
