-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('RENFO', 'GRIMPE', 'TECHNIQUE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FILE', 'LINK');

-- CreateTable
CREATE TABLE "exercise" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ExerciseCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_document" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "storagePath" TEXT,
    "url" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_exercise" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_exercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_coachId_idx" ON "exercise"("coachId");

-- CreateIndex
CREATE INDEX "exercise_document_coachId_idx" ON "exercise_document"("coachId");

-- CreateIndex
CREATE INDEX "exercise_document_exerciseId_idx" ON "exercise_document"("exerciseId");

-- CreateIndex
CREATE INDEX "sessions_coachId_idx" ON "sessions"("coachId");

-- CreateIndex
CREATE INDEX "session_exercise_coachId_idx" ON "session_exercise"("coachId");

-- CreateIndex
CREATE INDEX "session_exercise_exerciseId_idx" ON "session_exercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "session_exercise_sessionId_position_key" ON "session_exercise"("sessionId", "position");

-- AddForeignKey
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_document" ADD CONSTRAINT "exercise_document_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
