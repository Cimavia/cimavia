import type { PushTokenDto, RegisterPushTokenInput } from "@cmv/shared";
import { createNotificationApi, createNotificationPreferenceApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// ── Centre de notifications (#50) ────────────────────────────────────────────
// Routes, DTO et clés de cache vivent dans @cmv/shared : le web appelle exactement les mêmes.
// Ne reste ici que l'injection du client mobile (cookie de session tenu par SecureStore).
export const notificationApi = createNotificationApi(api);

// ── Réglages des notifications par e-mail (#65) ──────────────────────────────
export const notificationPreferenceApi = createNotificationPreferenceApi(api);

export { notificationKeys, notificationPreferenceKeys } from "@cmv/shared";

// ── Appareils (push) ─────────────────────────────────────────────────────────
// Propres au mobile : le web n'a pas d'appareil à enregistrer.

// Enregistre l'appareil courant. Idempotent côté API : rejouable à chaque démarrage.
export function registerPushToken(input: RegisterPushTokenInput): Promise<PushTokenDto> {
  return api.post<PushTokenDto>("/me/push-tokens", input);
}

// Révoque à la déconnexion : sans ça, l'appareil continuerait de recevoir les notifications
// d'un compte auquel il n'est plus connecté.
export function revokePushToken(token: string): Promise<void> {
  return api.delete<void>(`/me/push-tokens/${encodeURIComponent(token)}`);
}
