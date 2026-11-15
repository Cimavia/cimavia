import { PushPlatform } from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { registerPushToken, revokePushToken } from "@/feature/notification/api";
import {
  readInstallationSecret,
  storeInstallationSecret,
} from "@/feature/notification/util/installation-secret";
import { openDestination, routeForPushPayload } from "@/feature/notification/util/route.util";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { useActingCapability, useCapabilitySwitch } from "@/shared/hook/useExercisedCapability";
import { useAccountUser } from "@/shared/hook/useSessionGuard";

/**
 * Enregistre l'appareil pour les notifications push (p4-4).
 *
 * Appelé depuis la zone authentifiée seulement : un token ne vaut que rattaché à un compte, et
 * demander la permission sur l'écran de login serait incompréhensible pour l'utilisateur.
 *
 * Rejoué à chaque montage et à chaque changement de compte : Expo peut faire tourner le token
 * (réinstallation, restauration), et l'API est idempotente. Un échec ne casse jamais l'app — au pire, pas de notification.
 */
export function usePushToken() {
  const queryClient = useQueryClient();
  const { isCoach, isAthlete, isCompany, isPending } = useCapabilities();
  const acting = useActingCapability();
  const { visible, select } = useCapabilitySwitch();
  const accountId = useAccountUser()?.id;

  /**
   * Un token ne vaut que rattaché à un compte : l'enregistrement attend qu'il y en ait un, et se
   * rejoue quand il change. Séparé du listener, que le titre exercé fait relire à chaque bascule
   * du sélecteur — réenregistrer l'appareil à chaque fois serait un appel réseau pour rien.
   */
  useEffect(() => {
    if (accountId != null) void registerDevice();
  }, [accountId]);

  /**
   * Le push touché, en attente d'être ouvert. Le listener ne fait que le noter : au démarrage à
   * froid depuis une notification, la session n'est pas encore résolue, aucune capacité n'est
   * connue — router à ce moment ne mènerait nulle part, et Expo ne rejoue pas la réponse.
   */
  const [touched, setTouched] = useState<{ data: unknown } | null>(null);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // Le cache est PERSISTÉ et frais 5 min : arriver par un push sans invalider afficherait la
      // version d'avant l'événement qu'on vient d'annoncer. Même geste qu'au toucher d'une ligne
      // du centre — les deux portes d'entrée doivent se comporter pareil.
      queryClient.invalidateQueries();
      setTouched({ data: response.notification.request.content.data });
    });
    return () => subscription.remove();
  }, [queryClient]);

  // Ouvrir la notification doit mener à ce dont elle parle — sinon l'athlète atterrit sur l'accueil
  // et cherche lui-même la séance dont on vient de lui parler. Destinations partagées avec le
  // centre (#50) : même endroit, même titre (#344), par construction.
  useEffect(() => {
    if (touched == null || isPending) return;
    setTouched(null);
    openDestination(routeForPushPayload(touched.data, { isCoach, isAthlete, isCompany }, acting), {
      visible,
      select,
    });
  }, [touched, isPending, isCoach, isAthlete, isCompany, acting, visible, select]);
}

async function registerDevice(): Promise<void> {
  try {
    // Un émulateur n'a pas de service de notification : inutile d'y demander la permission.
    if (!Device.isDevice) return;

    const token = await resolveExpoPushToken();
    if (token == null) return;

    // Le secret prouve à l'API que c'est la MÊME installation qu'à l'enregistrement précédent
    // (#90) — sans lui, qui connaîtrait ce token pourrait le réenregistrer sur son compte et nous
    // priver de nos notifications. Absent au premier lancement : l'API en émet un.
    const secret = await readInstallationSecret();
    const registered = await registerPushToken({
      token,
      platform: Platform.OS === "ios" ? PushPlatform.IOS : PushPlatform.ANDROID,
      ...(secret == null ? {} : { installationSecret: secret }),
    });

    // `null` veut dire « garde celui que tu as », jamais « efface-le » : n'écrire que ce que
    // l'API vient d'émettre.
    if (registered.installationSecret != null) {
      await storeInstallationSecret(registered.installationSecret);
    }
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

/**
 * Les options iOS sont EXPLICITES, comme dans `timer-alert.ts` : sans `allowAlert`, la permission
 * est accordée SANS bannière, et le push arrive sans que rien ne s'affiche. Android les ignore,
 * ce qui a laissé l'écart vivre invisible jusqu'au premier build iPhone (#134).
 *
 * `allowBadge: false` suit le minuteur sans rien coûter : `NotificationService` n'envoie que
 * `title`, `body`, `data` et `sound` — aucun `badge` ne partirait qu'on refuserait ici.
 */
function requestPushPermission(): Promise<Notifications.NotificationPermissionsStatus> {
  return Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
}

async function resolveExpoPushToken(): Promise<string | null> {
  const existing = await Notifications.getPermissionsAsync();
  const granted = existing.granted || (await requestPushPermission()).granted === true;
  if (!granted) return null;

  // Le projectId est indispensable hors Expo Go : sans lui, Expo ne sait pas à quel projet
  // rattacher le token et lève.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string") return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}
