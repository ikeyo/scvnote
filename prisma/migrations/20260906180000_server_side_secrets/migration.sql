-- 비밀번호를 브라우저에서 암호화하던 구조(마스터 패스워드 + RSA 키쌍 + 프로젝트 공유 키)를
-- 걷어내고, 서버 키로 암호화해 저장하는 방식으로 바꾼다.
--
-- 기존 Secret 행은 각 사용자의 마스터 패스워드로 암호화돼 있어 서버가 풀 수 없다.
-- 새 스키마로 옮길 방법이 없으므로 지운다 - 이 마이그레이션을 적용하기 전에
-- 남겨야 할 항목이 있는지 반드시 확인할 것.
DELETE FROM "Secret";

-- DropForeignKey
ALTER TABLE "ProjectVaultKey" DROP CONSTRAINT "ProjectVaultKey_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectVaultKey" DROP CONSTRAINT "ProjectVaultKey_userId_fkey";

-- DropIndex
DROP INDEX "Secret_projectId_shared_idx";

-- AlterTable
ALTER TABLE "Secret" DROP COLUMN "secretCipher",
DROP COLUMN "secretIv",
DROP COLUMN "shared",
ADD COLUMN     "valueCipher" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "vaultCheckCipher",
DROP COLUMN "vaultCheckIv",
DROP COLUMN "vaultPrivateKeyCipher",
DROP COLUMN "vaultPrivateKeyIv",
DROP COLUMN "vaultPublicKey",
DROP COLUMN "vaultSalt";

-- DropTable
DROP TABLE "ProjectVaultKey";

-- CreateIndex
CREATE INDEX "Secret_projectId_title_idx" ON "Secret"("projectId", "title");
