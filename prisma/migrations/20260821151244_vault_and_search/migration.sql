-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vaultCheckCipher" TEXT,
ADD COLUMN     "vaultCheckIv" TEXT,
ADD COLUMN     "vaultSalt" TEXT;

-- CreateIndex
CREATE INDEX "Note_title_idx" ON "Note" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Note_contentText_idx" ON "Note" USING GIN ("contentText" gin_trgm_ops);
