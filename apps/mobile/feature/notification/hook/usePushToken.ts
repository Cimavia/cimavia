import { PushPlatform } from "@cmv/shared";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { type Href, router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { registerPushToken, revokePushToken } from "@/feature/notification/api";

/**
 * Enregistre l'appareil pour les notifications push (p4-4).
 *
 * Appelé depuis la zone authentifiée seulement : un token ne vaut que rattaché à un compte, et
 * demander la permission sur l'écran de login serait incompréhensible pour l'utilisateur.
 *
 * Rejoué à chaque montage : Expo peut faire tourner le token (réinstallation, restauration), et
 * l'API est idempotente. Un échec ne casse jamais l'app — au pire, pas de notification.
 */
export function usePushToken() {
  useEffect(() => {
    void registerDevice();

    // Ouvrir la notification doit mener à ce dont elle parle — sinon l'athlète atterrit sur
    // l'accueil et cherche lui-même la séance dont on vient de lui parler.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = routeFor(response.notification.request.content.data);
      if (target != null) router.push(target);
    });
    return () => subscription.remove();
  }, []);
}

// Le payload est écrit par NotificationService (API) : type + id de la cible. Inconnu → on ne
// navigue pas plutôt que de deviner (une version d'app plus ancienne qu'un push, par exemple).
function routeFor(data: unknown): Href | null {
  const payload = data as { type?: string; scheduledSessionId?: string } | null;
  switch (payload?.type) {
    case "PLAN_PUBLISHED":
    case "PLAN_UPDATED":
      return "/planning";
    case "FEEDBACK_RECEIVED":
      return payload.scheduledSessionId == null ? null : `/session/${payload.scheduledSessionId}`;
    case "INVOICE_ISSUED":
      return "/invoices";
    default:
      return null;
  }
}

async function registerDevice(): Promise<void> {
  try {
    // Un émulateur n'a pas de service de notification : inutile d'y demander la permission.
    if (!Device.isDevice) return;

    const token = await resolveExpoPushToken();
    if (token == null) return;

    await registerPushToken({
      token,
      platform: Platform.OS === "ios" ? PushPlatform.IOS : PushPlatform.ANDROID,
    });
  } catch {
    // Silencieux par choix : la permission refusée est un cas NORMAL, et une panne de push ne
    // doit pas polluer un écran de planning. Les erreurs de livraison, elles, sont tracées côté
    // API (Pino → Axiom).
  }
}

/**
 * Détache l'appareil du compte courant — à appeler AVANT `signOut()`, tant que la session est
 * encore valide (l'API scope la révocation sur l'utilisateur connecté).
 *
 * Sans ça, le téléphone continuerait de recevoir les notifications du compte quitté : c'est une
 * fuite d'information vers le prochain utilisateur de l'appareil, pas un simple désagrément.
 */
export async function revokeCurrentPushToken(): Promise<void> {
  try {
    const token = await resolveExpoPushToken();
    if (token != null) await revokePushToken(token);
  } catch {
    // Une déconnexion ne doit jamais échouer pour un push : au pire le token reste, et l'API le
    // réaffectera au prochain compte qui s'annoncera depuis cet appareil.
  }
}

async function resolveExpoPushToken(): Promise<string | null> {
  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted === true;
  if (!granted) return null;

  // Le projectId est indispensable hors Expo Go : sans lui, Expo ne sait pas à quel projet
  // rattacher le token et lève.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string") return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}
