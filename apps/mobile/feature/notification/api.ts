import type { PushTokenDto, RegisterPushTokenInput } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Enregistre l'appareil courant. Idempotent côté API : rejouable à chaque démarrage.
export function registerPushToken(input: RegisterPushTokenInput): Promise<PushTokenDto> {
  return api.post<PushTokenDto>("/me/push-tokens", input);
}

// Révoque à la déconnexion : sans ça, l'appareil continuerait de recevoir les notifications
// d'un compte auquel il n'est plus connecté.
export function revokePushToken(token: string): Promise<void> {
  return api.delete<void>(`/me/push-tokens/${encodeURIComponent(token)}`);
}
