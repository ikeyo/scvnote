-- AlterTable
ALTER TABLE "Secret" ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vaultPrivateKeyCipher" TEXT,
ADD COLUMN     "vaultPrivateKeyIv" TEXT,
ADD COLUMN     "vaultPublicKey" TEXT;

-- CreateTable
CREATE TABLE "ProjectVaultKey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVaultKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVaultKey_projectId_userId_key" ON "ProjectVaultKey"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Secret_projectId_shared_idx" ON "Secret"("projectId", "shared");

-- AddForeignKey
ALTER TABLE "ProjectVaultKey" ADD CONSTRAINT "ProjectVaultKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVaultKey" ADD CONSTRAINT "ProjectVaultKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

