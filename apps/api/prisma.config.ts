import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // process.env utilisé au lieu de env() de Prisma :
    // env() throw si la variable est absente, ce qui casse `prisma generate`
    // dans les contextes où DATABASE_URL n'existe pas (ex: EAS build mobile).
    // prisma generate n'a pas besoin de l'URL réelle — seul le schema compte.
    // Le fallback dummy n'est jamais utilisé pour se connecter.
    url: process.env.DATABASE_URL ?? "",
  },
});
