import * as Notifications from "expo-notifications";
import { Vibration } from "react-native";

/** Trois vibrations courtes : reconnaissable sans regarder, et distinct d'une notification reçue. */
const PATTERN = [0, 220, 120, 220, 120, 220];

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
 */
export async function scheduleTimerEnd(
  endsAt: number,
  title: string,
  body: string,
): Promise<string | null> {
  const seconds = (endsAt - Date.now()) / 1000;
  // Sous la seconde, l'OS refuse ou déclenche aussitôt : la vibration a déjà fait le travail.
  if (seconds < 1) return null;

  try {
    if (!(await hasPermission())) return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      },
    });
  } catch {
    // Permission refusée, notification indisponible : la vibration et l'écran restent. Rien à
    // signaler, rien à réparer.
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
 * refusé les notifications du coach et vouloir quand même son minuteur de repos.
 */
async function hasPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted === true;
}
