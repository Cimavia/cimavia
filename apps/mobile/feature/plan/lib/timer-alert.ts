import * as Notifications from "expo-notifications";
import { Vibration } from "react-native";

/** Trois vibrations courtes : reconnaissable sans regarder, et distinct d'une notification reçue. */
const PATTERN = [0, 220, 120, 220, 120, 220];

/**
 * Ce qui prévient l'athlète qu'un timer est fini.
 *
 * Le cas d'usage réel est **téléphone en poche** : on n'entend rien en salle, et l'écran est
 * éteint. D'où les deux à la fois — la vibration porte le signal, la notification laisse une trace
 * qu'on retrouve en sortant le téléphone.
 *
 * `trigger: null` : la notification part TOUT DE SUITE. La programmer à l'avance la rendrait
 * fausse dès que l'athlète met le timer en pause ou le passe.
 */
export async function alertTimerDone(title: string, body: string): Promise<void> {
  Vibration.vibrate(PATTERN);
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // Permission refusée, ou notification indisponible : la vibration a déjà fait le travail, et
    // l'écran affiche la fin du timer. Rien à signaler, rien à réparer.
  }
}
