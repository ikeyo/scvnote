-- MCP 토큰을 계정당 하나에서 기기별 여러 개로 바꾼다.
-- 기존 토큰은 새 표로 옮겨서 지금 연결된 클라이언트가 끊기지 않게 한다.

CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");
CREATE INDEX "McpToken_userId_idx" ON "McpToken"("userId");

ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 쓰던 토큰을 그대로 살린다. 평문은 어차피 없고 해시만 옮기면 되므로 연결은 유지된다.
INSERT INTO "McpToken" ("id", "label", "tokenHash", "userId")
SELECT gen_random_uuid()::text, '이전 토큰', "mcpTokenHash", "id"
FROM "User"
WHERE "mcpTokenHash" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "mcpTokenHash";
