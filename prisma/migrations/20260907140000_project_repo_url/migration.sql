-- 프로젝트에 연결된 코드 저장소. 있으면 그 프로젝트의 작업일지에 빌드 줄을 요구하고,
-- 없으면(회의록 같은 일반 프로젝트) 그냥 저장한다.
ALTER TABLE "Project" ADD COLUMN "repoUrl" TEXT;
