import { envSchema } from "@cmv/shared";
import { z } from "zod";

// Cette fonction est appelée par NestJS ConfigModule au démarrage
// Elle reçoit les variables d'env brutes et retourne les variables validées et transformées
// Si la validation échoue, elle throw — NestJS arrête le démarrage et affiche l'erreur
export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    // Formater les erreurs Zod pour un message lisible
    const formatted = z.prettifyError(result.error);

    throw new Error(
      `\n❌ Variables d'environnement invalides :\n${formatted}\n` +
        `Vérifiez votre fichier .env (voir .env.template pour les variables requises)\n`,
    );
  }

  return result.data;
}
