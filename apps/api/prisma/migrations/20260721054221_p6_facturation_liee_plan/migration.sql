/*
  Warnings:

  - A unique constraint covering the columns `[planId]` on the table `invoice` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "planId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
ALTER COLUMN "issuedAt" DROP NOT NULL,
ALTER COLUMN "issuedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "invoice_planId_key" ON "invoice"("planId");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
