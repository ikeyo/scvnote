-- 노트 본문의 특정 대목에 할 일을 묶기 위한 인용문. 기존 할 일은 NULL로 남고
-- 지금까지처럼 노트 전체에 붙은 항목으로 계속 동작한다.
ALTER TABLE "Todo" ADD COLUMN "anchorText" TEXT;
