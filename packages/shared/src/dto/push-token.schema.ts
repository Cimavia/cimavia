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

export const registerPushTokenSchema = z
  .object({
    token: expoPushTokenSchema,
    // Sans effet sur la livraison (Expo route seul) : sert au diagnostic en production.
    platform: pushPlatformSchema,
  })
  .strict();
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const pushTokenDtoSchema = z.object({
  id: z.string(),
  token: z.string(),
  platform: pushPlatformSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PushTokenDto = z.infer<typeof pushTokenDtoSchema>;
