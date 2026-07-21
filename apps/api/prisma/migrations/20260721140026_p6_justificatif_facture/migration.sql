-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "documentFileName" TEXT,
ADD COLUMN     "documentMimeType" TEXT,
ADD COLUMN     "documentPath" TEXT,
ADD COLUMN     "documentSizeBytes" INTEGER;
