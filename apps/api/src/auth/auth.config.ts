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
 * Le profil (role, locale) vit sur `user` via additionalFields — validés côté app :
 * `role` ∈ Role, `locale` ∈ Locale. ADMIN n'est pas auto-assignable à l'inscription.
 */
export function createAuth(prisma: PrismaClient, config: AuthConfig) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
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
        role: { type: "string", required: true, input: true },
        locale: { type: "string", required: false, input: true, defaultValue: Locale.FR },
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
            return { data: user };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
