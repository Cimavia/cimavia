-- CreateTable
CREATE TABLE "exercise_tag" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_session_exercise_tag" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "scheduledSessionExerciseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_session_exercise_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_tag_coachId_idx" ON "exercise_tag"("coachId");

-- CreateIndex
CREATE INDEX "exercise_tag_coachId_name_idx" ON "exercise_tag"("coachId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_tag_exerciseId_name_key" ON "exercise_tag"("exerciseId", "name");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_tag_coachId_idx" ON "scheduled_session_exercise_tag"("coachId");

-- CreateIndex
CREATE INDEX "scheduled_session_exercise_tag_athleteId_idx" ON "scheduled_session_exercise_tag"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_session_exercise_tag_scheduledSessionExerciseId_n_key" ON "scheduled_session_exercise_tag"("scheduledSessionExerciseId", "name");

-- AddForeignKey
ALTER TABLE "exercise_tag" ADD CONSTRAINT "exercise_tag_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_session_exercise_tag" ADD CONSTRAINT "scheduled_session_exercise_tag_scheduledSessionExerciseId_fkey" FOREIGN KEY ("scheduledSessionExerciseId") REFERENCES "scheduled_session_exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
