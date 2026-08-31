-- CreateEnum
CREATE TYPE "MetricValueType" AS ENUM ('NUMBER', 'DURATION', 'TEXT', 'SCALE');

-- AlterTable
ALTER TABLE "exercise" ADD COLUMN     "blocks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "instructions" JSONB;

-- AlterTable
ALTER TABLE "scheduled_session_exercise" ADD COLUMN     "blocks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "instructions" JSONB;

-- CreateTable
CREATE TABLE "custom_metric" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "valueType" "MetricValueType" NOT NULL,
    "scale" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_metric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_metric_coachId_idx" ON "custom_metric"("coachId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_metric_coachId_label_key" ON "custom_metric"("coachId", "label");

-- AddForeignKey
ALTER TABLE "custom_metric" ADD CONSTRAINT "custom_metric_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
