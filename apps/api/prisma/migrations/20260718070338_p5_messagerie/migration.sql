-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "content" TEXT,
    "storagePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationSeconds" INTEGER,
    "scheduledSessionId" TEXT,
    "sessionFeedbackId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_coachId_idx" ON "conversation"("coachId");

-- CreateIndex
CREATE INDEX "conversation_athleteId_idx" ON "conversation"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_coachId_athleteId_key" ON "conversation"("coachId", "athleteId");

-- CreateIndex
CREATE INDEX "message_conversationId_createdAt_idx" ON "message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "message_coachId_idx" ON "message"("coachId");

-- CreateIndex
CREATE INDEX "message_athleteId_idx" ON "message"("athleteId");

-- CreateIndex
CREATE INDEX "message_scheduledSessionId_idx" ON "message"("scheduledSessionId");

-- CreateIndex
CREATE INDEX "message_sessionFeedbackId_idx" ON "message"("sessionFeedbackId");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "scheduled_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sessionFeedbackId_fkey" FOREIGN KEY ("sessionFeedbackId") REFERENCES "session_feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;
