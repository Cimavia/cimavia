import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

/**
 * Token de notification push : l'adresse d'une INSTALLATION de l'app sur un appareil, pas d'un
 * utilisateur. Fourni par `expo-notifications` côté client après accord de l'utilisateur, il est
 * relayé à Apple/Google par `expo-server-sdk` côté API. Un utilisateur peut en avoir plusieurs
 * (téléphone + tablette), et un token change (réinstallation, restauration de sauvegarde).
 */
export const PushPlatform = {
  IOS: "IOS",
  ANDROID: "ANDROID",
} as const;
export type PushPlatform = TypesValuesOf<typeof PushPlatform>;
export const pushPlatformSchema = z.enum(PushPlatform);

// Format Expo : `ExponentPushToken[xxxxxxxx]` (les deux orthographes circulent selon les SDK).
// Contraint ICI pour rejeter en 400 une valeur qui ne pourrait de toute façon jamais être livrée.
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export const expoPushTokenSchema = z.string().regex(EXPO_PUSH_TOKEN_PATTERN, {
  message: "Token de notification Expo invalide",
});

export function isExpoPushToken(token: string): boolean {
  return EXPO_PUSH_TOKEN_PATTERN.test(token);
}

/**
 * Secret d'installation (#90) — ce qui distingue l'appareil qui PORTE le token de qui en connaît
 * seulement la valeur.
 *
 * Le token est une adresse de livraison, pas un secret : qui la connaît pouvait jusqu'ici la
 * réenregistrer sur son propre compte et priver son propriétaire de ses notifications. Le secret
 * répond à la seule question qui compte au moment de réaffecter un appareil : « es-tu la même
 * installation que celle qui l'avait ? »
 *
 * Il est **émis par l'API** et non tiré par le client : le mobile n'a pas de source d'aléa
 * cryptographique (ni `expo-crypto`, ni polyfill `crypto.getRandomValues` dans le runtime Expo).
 * Le téléphone n'a donc qu'à le CONSERVER, ce que `expo-secure-store` fait déjà pour la session.
 * Base64url de 32 octets, d'où le jeu de caractères — la borne reste large pour qu'un changement
 * de taille côté serveur ne fasse pas d'un secret déjà distribué une valeur soudain invalide.
 */
export const PUSH_INSTALLATION_SECRET_BYTES = 32;

export const installationSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, {
  message: "Secret d'installation invalide",
});

export const registerPushTokenSchema = z
  .object({
    token: expoPushTokenSchema,
    // Sans effet sur la livraison (Expo route seul) : sert au diagnostic en production.
    platform: pushPlatformSchema,
    /**
     * FACULTATIF, et c'est la condition pour ne casser personne : une installation qui n'a pas
     * encore reçu de secret (première version de l'app, ligne déjà en base avant #90) doit
     * pouvoir s'enregistrer et s'en faire émettre un. L'exiger verrouillerait à vie les appareils
     * de la bêta. Ce qu'il garde, c'est la RÉAFFECTATION d'un appareil déjà scellé.
     */
    installationSecret: installationSecretSchema.optional(),
  })
  .strict();
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const pushTokenDtoSchema = z.object({
  id: z.string(),
  token: z.string(),
  platform: pushPlatformSchema,
  /**
   * Le secret en clair, la SEULE fois où l'API l'émet — la base n'en garde que l'empreinte, donc
   * personne ne pourra le redonner ensuite. `null` ne veut pas dire « pas de secret » mais
   * « rien de neuf à ranger » : celui que le client a déjà reste valable (règle n°5, pas de repli
   * silencieux — le client ne doit surtout pas écraser ce qu'il détient par un vide).
   */
  installationSecret: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PushTokenDto = z.infer<typeof pushTokenDtoSchema>;
