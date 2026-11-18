import { describePlaybackError } from "@cmv/shared";
import * as Sentry from "@sentry/react-native";
import { Platform } from "react-native";

/**
 * Ce que les lecteurs de média disent à Sentry — la note vocale (#701) et la vidéo (#809).
 *
 * Un seul envoi pour les deux, et non une copie par lecteur : c'est la forme de l'événement (titre,
 * tags, ce qui est tu de l'URL) qui permet de les lire côte à côte dans Sentry.
 */

/**
 * Une lecture que le natif a cassée. Seul l'hôte de l'URL part, jamais sa signature. `null` : le
 * natif n'a rien dit — et ça se voit, plutôt qu'une chaîne vide qui passerait pour sa réponse.
 */
export function reportPlaybackError(
  title: string,
  nativeMessage: string | null,
  sourceUrl: string,
): void {
  const { host, message } = describePlaybackError(nativeMessage ?? "", sourceUrl);
  Sentry.captureMessage(title, {
    level: "error",
    tags: { platform: Platform.OS, ...(host == null ? {} : { host }) },
    extra: { nativeMessage: nativeMessage == null ? null : message },
  });
}
