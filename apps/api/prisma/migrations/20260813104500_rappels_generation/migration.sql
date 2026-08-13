-- CreateEnum
CREATE TYPE "ReminderReason" AS ENUM ('PLAN_ENDING', 'INVOICE_OVERDUE');

-- AlterTable
ALTER TABLE "reminder" ADD COLUMN     "pushedAt" TIMESTAMP(3),
ADD COLUMN     "reason" "ReminderReason",
ALTER COLUMN "note" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "reminder_status_dueAt_pushedAt_idx" ON "reminder"("status", "dueAt", "pushedAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_coachId_entityType_entityId_reason_key" ON "reminder"("coachId", "entityType", "entityId", "reason");

