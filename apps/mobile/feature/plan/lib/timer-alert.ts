import * as Notifications from "expo-notifications";
import { Platform, Vibration } from "react-native";

/** Trois vibrations courtes : reconnaissable sans regarder, et distinct d'une notification reçue. */
const PATTERN = [0, 220, 120, 220, 120, 220];

/** Le canal Android des minuteurs. Sans canal, Android 8+ n'affiche RIEN et ne le dit pas. */
const CHANNEL_ID = "cimavia-timer";

/** La vibration de fin. Elle ne porte QUE si l'app est au premier plan — le JS y est gelé sinon. */
export function vibrateTimerDone(): void {
  Vibration.vibrate(PATTERN);
}

/**
 * La notification de fin de timer, **programmée à l'avance** sur l'échéance.
 *
 * C'est le seul moyen d'être prévenu téléphone verrouillé ou app quittée : en arrière-plan le JS
 * est gelé, le décompte ne tourne plus, et une notification envoyée « au moment où le timer finit »
 * n'est jamais envoyée. C'est l'OS qui la déclenche, pas nous.
 *
 * Elle doit donc être ANNULÉE dès que l'échéance change — pause, « Passer », « + 30 s » —, sinon
 * elle sonnerait pour un repos que l'athlète a déjà arrêté. `useTimerNotification` s'en charge.
 *
 * Retourne `null` quand rien n'a pu être programmé. L'appelant le DIT à l'athlète : un minuteur
 * silencieux qu'on croit armé est pire que pas de minuteur du tout.
 */
export async function scheduleTimerEnd(
  endsAt: number,
  title: string,
  body: string,
): Promise<string | null> {
  // Entier et au moins 1 s : iOS refuse un intervalle nul, et un flottant n'a aucun sens ici.
  const seconds = Math.round((endsAt - Date.now()) / 1000);
  if (seconds < 1) return null;

  try {
    if (!(await ensurePermission())) return null;
    await ensureChannel();

    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        /**
         * `timeSensitive` : un repos qui finit doit percer un Focus et s'afficher ÉCRAN
         * VERROUILLÉ. Sans ce niveau, iOS la range en « résumé programmé » et l'athlète ne la
         * voit qu'au déverrouillage — c'est-à-dire trop tard, sa série suivante est passée.
         */
        interruptionLevel: "timeSensitive",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
    });
  } catch {
    // Notification indisponible sur cet appareil : la vibration et l'écran restent, et le bandeau
    // affiche que le minuteur ne sonnera pas.
    return null;
  }
}

export async function cancelTimerEnd(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Déjà tirée ou déjà annulée : il n'y a rien à défaire.
  }
}

/**
 * La permission est demandée ICI et pas seulement à l'inscription au push : un athlète peut avoir
 * refusé les notifications de son coach et vouloir quand même son minuteur de repos.
 *
 * Les options iOS sont explicites — sans `allowAlert`, la permission est accordée SANS bannière,
 * et la notification part sans que rien ne s'affiche.
 */
async function ensurePermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Minuteurs",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: PATTERN,
    sound: "default",
  });
}
