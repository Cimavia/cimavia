import { expo } from "@better-auth/expo";
import { Locale, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, Role } from "@cmv/shared";
import { Logger } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";

const logger = new Logger("Auth");

export type AuthConfig = {
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
};

/**
 * Instance Better Auth branchée sur le PrismaClient **unique** de l'app (adapter Prisma).
 * Le profil (capacités, role, locale) vit sur `user` via additionalFields — validés côté app :
 * `role` ∈ Role, `locale` ∈ Locale. ADMIN n'est pas auto-assignable à l'inscription.
 *
 * Les capacités y sont déclarées, et ce n'est pas cosmétique : Better Auth ne renvoie dans
 * `session.user` que les champs DÉCLARÉS. Des colonnes Prisma seules ne remonteraient jamais
 * jusqu'à `authClient.useSession()`, et `capabilitiesOf()` rendrait « aucune capacité » à tout
 * le monde — nav vide sur les deux plateformes, sans qu'aucune porte qualité ne le voie (#9).
 */
export function createAuth(prisma: PrismaClient, config: AuthConfig) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [
      ...config.trustedOrigins,
      // Origines supplémentaires : IP réseau locale, tunnel ngrok/Expo…
      // Configurer via BETTER_AUTH_TRUSTED_ORIGINS (valeurs séparées par virgule)
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((o) => o.trim()) ?? []),
    ],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    // Le modèle Prisma de session auth est renommé `AuthSession` pour libérer le nom `Session`
    // au profit de l'entité métier séance (P2). La table reste `session` (via @@map) — pas de
    // migration de données. Better Auth résout le délégué Prisma via ce `modelName`.
    session: { modelName: "authSession" },
    // Plugin serveur Expo : gère l'origine (scheme cimavia://) et les cookies natifs du client mobile.
    plugins: [expo()],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      sendResetPassword: async ({ user, url }) => {
        // MOCKED — envoi de l'email de réinitialisation. À connecter (infra mail + i18n) en P7.
        logger.warn(`MOCKED reset-password pour ${user.email} : ${url}`);
      },
    },
    user: {
      additionalFields: {
        /**
         * Capacités CUMULABLES (#9) : ce qui fonde un droit, à la place de `role`.
         *
         * `input: false` — le client ne les pose pas, elles se dérivent du rôle envoyé au signup
         * (cf. databaseHooks). #12 inverse ce sens : les cases à cocher deviennent l'entrée, et
         * `role` en est déduit. D'ici là, un compte créé ici est déjà correct.
         */
        isCoach: { type: "boolean", required: false, input: false, defaultValue: false },
        isAthlete: { type: "boolean", required: false, input: false, defaultValue: false },
        // Persona d'AFFICHAGE seul depuis #9 : sur quel univers atterrit un compte à double
        // capacité. Ne fonde plus aucun droit — `capabilitiesOf()` ne le lit plus.
        role: { type: "string", required: true, input: true },
        locale: {
          type: "string",
          required: false,
          input: true,
          defaultValue: Locale.FR,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const role = (user as { role?: string }).role;
            // Seuls COACH / ATHLETE sont auto-assignables à l'inscription ; ADMIN est réservé.
            if (role !== Role.COACH && role !== Role.ATHLETE) {
              throw new APIError("BAD_REQUEST", {
                message: "role invalide : COACH ou ATHLETE attendu",
              });
            }
            // Les capacités se dérivent ICI et nulle part ailleurs. Sans ce hook, un compte créé
            // après #9 naîtrait aux `@default(false)` du schéma — donc sans AUCUNE capacité, là
            // où la migration a servi les comptes existants. Deux chemins de création, deux
            // résultats : c'est exactement ce qu'on ne veut pas laisser diverger.
            return {
              data: { ...user, isCoach: role === Role.COACH, isAthlete: role === Role.ATHLETE },
            };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
