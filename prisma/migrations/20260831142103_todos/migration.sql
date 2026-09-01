-- CreateEnum
CREATE TYPE "TodoKind" AS ENUM ('BUG', 'IMPROVEMENT', 'IDEA', 'TASK');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('TODO', 'DOING', 'DONE');

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "kind" "TodoKind" NOT NULL DEFAULT 'TASK',
    "status" "TodoStatus" NOT NULL DEFAULT 'TODO',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "projectId" TEXT,
    "noteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Todo_projectId_status_idx" ON "Todo"("projectId", "status");

-- CreateIndex
CREATE INDEX "Todo_status_updatedAt_idx" ON "Todo"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
