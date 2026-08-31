-- CreateEnum
CREATE TYPE "DocumentUsage" AS ENUM ('ATTACHMENT', 'INSTRUCTION');

-- AlterTable
ALTER TABLE "exercise_document" ADD COLUMN     "usage" "DocumentUsage" NOT NULL DEFAULT 'ATTACHMENT';

-- AlterTable
ALTER TABLE "scheduled_session_exercise_document" ADD COLUMN     "usage" "DocumentUsage" NOT NULL DEFAULT 'ATTACHMENT';
