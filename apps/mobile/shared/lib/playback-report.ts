import { describePlaybackError, type VideoPlaybackReport } from "@cmv/shared";
import * as Sentry from "@sentry/react-native";
import { getNetworkStateAsync } from "expo-network";
import { Platform } from "react-native";

/**
 * Ce que les lecteurs de média disent à Sentry — la note vocale (#701) et la vidéo (#809).
 *
 * Un seul envoi pour les deux, et non une copie par lecteur : c'est la forme de l'événement (titre,
 * tags, ce qui est tu de l'URL) qui permet de les lire côte à côte dans Sentry.
 *
 * La lenteur part en MESSAGE, pas en trace : `tracesSampleRate` reste à 0 (#183), et une lecture
 * fluide n'envoie rien — c'est `videoPlaybackReport` qui en décide.
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

/**
 * Le réseau de l'appareil, en minuscules (`wifi`, `cellular`…) ; `null` quand le système ne le dit
 * pas. C'est lui qui dit si une lecture lente suit la 5G ou se voit aussi en wifi.
 */
export async function currentNetworkType(): Promise<string | null> {
  try {
    return (await getNetworkStateAsync()).type?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Une lecture vidéo lente (#809) : le réseau en tag, pour filtrer — absent quand il est inconnu,
 * comme l'hôte d'une erreur ; l'attente et le débit en extra.
 */
export function reportSlowVideo(report: VideoPlaybackReport, network: string | null): void {
  Sentry.captureMessage("Lecture d'une vidéo lente", {
    level: "warning",
    tags: {
      platform: Platform.OS,
      started: String(report.started),
      ...(network == null ? {} : { network }),
    },
    extra: { ...report },
  });
}
