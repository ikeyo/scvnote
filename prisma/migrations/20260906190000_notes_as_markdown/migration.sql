-- 노트 본문을 TipTap JSON에서 마크다운 원문으로 바꾼다.
--
-- 기존 노트의 글자는 `contentText`(검색용으로 이미 평문화해 둔 값)에서 그대로 옮겨온다.
-- 제목·목록 같은 서식 표시는 이 과정에서 평문이 된다 - 글자는 하나도 잃지 않는다.
ALTER TABLE "Note" ADD COLUMN "body" TEXT NOT NULL DEFAULT '';
UPDATE "Note" SET "body" = "contentText";

-- DropIndex
DROP INDEX "Note_contentText_idx";

-- AlterTable
ALTER TABLE "Note" DROP COLUMN "content",
DROP COLUMN "contentText";

-- CreateIndex
CREATE INDEX "Note_body_idx" ON "Note" USING GIN ("body" gin_trgm_ops);
