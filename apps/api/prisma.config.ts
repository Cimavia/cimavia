import { defineConfig } from "prisma/config";

// Chargement du .env par Node (natif) plutôt que par dotenv, qui était une devDependency :
// `prisma migrate deploy` tourne dans l'image de production (au démarrage du conteneur), où les
// devDeps sont absentes — l'import de dotenv y cassait la migration. En conteneur, DATABASE_URL
// vient de l'environnement et il n'y a pas de fichier .env : l'ENOENT est donc attendu.
try {
  process.loadEnvFile();
} catch {
  // Pas de .env : les variables sont déjà dans l'environnement (conteneur, CI).
}

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
