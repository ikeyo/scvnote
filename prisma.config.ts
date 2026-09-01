import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads the connection URL from schema.prisma or .env directly.
//
// `datasource` is only needed by the migrate/introspect commands. `prisma generate`
// runs during the Docker build, where no database exists yet - so the block is
// omitted rather than left to throw on a missing variable.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(url ? { datasource: { url } } : {}),
});
