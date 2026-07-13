-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PlanWeekType" AS ENUM ('TRAINING', 'DELOAD');

-- CreateEnum
CREATE TYPE "ScheduledSessionStatus" AS ENUM ('PLANNED', 'DONE', 'SKIPPED');

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATE NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_week" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "type" "PlanWeekType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_session" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planWeekId" TEXT NOT NULL,
    "sourceSessionId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "scheduledDate" DATE NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "ScheduledSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_session_exercise" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "scheduledSessionId" TEXT NOT NULL,
    "sourceExerciseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ExerciseCategory" NOT NULL,
    "prescription" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_session_exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_session_exercise_document" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "scheduledSessionExerciseId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "storagePath" TEXT,
    "url" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_session_exercise_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_coachId_idx" ON "plan"("coachId");

-- CreateIndex
CREATE INDEX "plan_athleteId_status_idx" ON "plan"("athleteId", "status");

-- CreateIndex
CREATE INDEX "plan_week_coachId_idx" ON "plan_week"("coachId");

-- CreateIndex
CREATE INDEX "plan_week_athleteId_idx" ON "plan_week"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_week_planId_weekNumber_key" ON "plan_week"("planId", "weekNumber");

-- CreateIndex
CREATE INDEX "scheduled_session_coachId_idx" ON "scheduled_session"("coachId");

-- CreateIndex
CREATE INDEX "scheduled_session_athleteId_scheduledDate_idx" ON "scheduled_session"("athleteId", "scheduledDate");

-- CreateIndex
CREATE INDEX "scheduled_session_planId_idx" ON "scheduled_session"("planId");

-- CreateIndex
CREATE INDEX "scheduled_session_sourceSessionId_idx" ON "scheduled_session"("sourceSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_session_planWeekId_scheduledDate_position_key" ON "scheduled_session"("planWeekId", "scheduledDate", "position");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_coachId_idx" ON "scheduled_session_exercise"("coachId");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_athleteId_idx" ON "scheduled_session_exercise"("athleteId");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_sourceExerciseId_idx" ON "scheduled_session_exercise"("sourceExerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_session_exercise_scheduledSessionId_position_key" ON "scheduled_session_exercise"("scheduledSessionId", "position");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_document_coachId_idx" ON "scheduled_session_exercise_document"("coachId");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_document_athleteId_idx" ON "scheduled_session_exercise_document"("athleteId");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_document_scheduledSessionExercis_idx" ON "scheduled_session_exercise_document"("scheduledSessionExerciseId");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_document_storagePath_idx" ON "scheduled_session_exercise_document"("storagePath");

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_week" ADD CONSTRAINT "plan_week_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session" ADD CONSTRAINT "scheduled_session_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session" ADD CONSTRAINT "scheduled_session_planWeekId_fkey" FOREIGN KEY ("planWeekId") REFERENCES "plan_week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session" ADD CONSTRAINT "scheduled_session_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session_exercise" ADD CONSTRAINT "scheduled_session_exercise_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "scheduled_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session_exercise" ADD CONSTRAINT "scheduled_session_exercise_sourceExerciseId_fkey" FOREIGN KEY ("sourceExerciseId") REFERENCES "exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session_exercise_document" ADD CONSTRAINT "scheduled_session_exercise_document_scheduledSessionExerci_fkey" FOREIGN KEY ("scheduledSessionExerciseId") REFERENCES "scheduled_session_exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
