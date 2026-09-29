import type { SessionTracking } from "@cmv/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";

const key = (sessionId: string) => `cimavia-tracking:${sessionId}`;

/**
 * Le suivi local d'UNE séance, tel que tous ses lecteurs le voient.
 *
 * POURQUOI un magasin au niveau du module (#346). L'écran de séance reste monté sous le débrief,
 * sur la même pile, et chacun tenait sa copie : le débrief corrigeait 3/4 en 4/4 et vidait le
 * disque à l'enregistrement, l'écran de séance gardait 3/4 — et comme le local l'emporte sur le
 * serveur, la coche suivante y réécrivait « 3/4 + x ». Une seule entrée par séance, lue par les
 * deux, ne peut plus diverger. Même montage que le presse-papier de semaine côté web (#4).
 */
type Entry = {
  /** `null` = rien en local : les lecteurs SUIVENT le distant. */
  value: SessionTracking | null;
  /** Une écriture est passée : ce que le disque renverra ensuite est plus ancien qu'elle. */
  written: boolean;
  listeners: Set<() => void>;
};

/**
 * Une entrée n'existe que tant qu'un écran la lit : le dernier parti, elle est oubliée, et le
 * prochain montage relit le disque. La mémoire ne survit donc jamais aux écrans qu'elle sert.
 */
const entries = new Map<string, Entry>();

function notify(entry: Entry): void {
  for (const listener of entry.listeners) listener();
}

/**
 * Le disque n'est lu qu'au PREMIER lecteur : le second — le débrief ouvert par-dessus la séance —
 * trouve la valeur déjà en mémoire, à jour de chaque coche.
 */
function load(sessionId: string, entry: Entry): void {
  AsyncStorage.getItem(key(sessionId))
    .then((raw) => {
      // Déjà réécrite : une coche posée avant cette réponse a écrasé le disque, qui ne porte plus
      // la vérité. Une entrée oubliée entre-temps n'a plus de lecteur : l'écrire ne touche rien.
      if (entry.written || raw == null) return;
      entry.value = JSON.parse(raw) as SessionTracking;
      notify(entry);
    })
    // Un cache illisible n'est pas une raison de bloquer la séance : on reste sur le distant.
    .catch(() => undefined);
}

export function subscribeLocalTracking(sessionId: string, listener: () => void): () => void {
  let entry = entries.get(sessionId);
  if (entry == null) {
    entry = { value: null, written: false, listeners: new Set() };
    entries.set(sessionId, entry);
    load(sessionId, entry);
  }
  const subscribed = entry;
  subscribed.listeners.add(listener);
  return () => {
    subscribed.listeners.delete(listener);
    if (subscribed.listeners.size === 0 && entries.get(sessionId) === subscribed) {
      entries.delete(sessionId);
    }
  };
}

/**
 * La valeur COURANTE, à jour dès l'écriture — sans attendre de rendu.
 *
 * Le rattrapage du déroulé coche plusieurs unités dans le même tic (#306) : chaque coche doit
 * partir de la précédente, et c'est ici qu'elle la trouve. Stable en identité entre deux
 * écritures, comme l'exige `useSyncExternalStore`.
 */
export function readLocalTracking(sessionId: string): SessionTracking | null {
  return entries.get(sessionId)?.value ?? null;
}

/**
 * Mémoire, lecteurs et disque changent ENSEMBLE : `null` efface le local.
 *
 * Écriture disque non attendue : cocher doit répondre à l'instant, pas au retour du disque.
 */
export function writeLocalTracking(sessionId: string, next: SessionTracking | null): void {
  const entry = entries.get(sessionId);
  if (entry != null) {
    entry.value = next;
    entry.written = true;
    notify(entry);
  }
  if (next == null) void AsyncStorage.removeItem(key(sessionId));
  else void AsyncStorage.setItem(key(sessionId), JSON.stringify(next));
}
