import { trimTrailingSlashes } from "@cmv/shared";

/**
 * Origine de l'app WEB : là où atterrit le lien de réinitialisation (#64), et là où un compte
 * Entreprise trouve son espace (#600).
 *
 * ⚠️ Cette origine doit figurer dans le `CORS_ORIGINS` de l'API. Better Auth valide `redirectTo`
 * contre ses `trustedOrigins` et refuse une origine inconnue : le web s'en sort sans y penser
 * parce qu'il envoie la SIENNE, le mobile en envoie une tierce.
 *
 * La barre oblique finale est retirée : la valeur vient d'une variable d'environnement copiée à la
 * main, et `https://app.cimavia.fr/` produirait un `//reset-password` que le routeur web ignore.
 * Le repli local ne sert qu'en développement : `app.config.ts` exige la variable en production.
 */
export const WEB_URL = trimTrailingSlashes(
  process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:5173",
);
