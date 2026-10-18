import type { ConversationDto, MessageDto } from "../dto/message.schema";

/**
 * Le message qui déclenche le marquage lu d'un fil : le DERNIER entrant créé après sa marque de
 * lecture (`lastReadAt`, #611), par son id.
 *
 * POURQUOI un id et pas « y a-t-il un entrant non lu ? » (#305). `markRead` ne recharge ni les
 * messages ni le fil ouvert : la marque reste celle d'avant dans le cache jusqu'au sondage suivant.
 * Un second entrant arrivé entre-temps laisse un booléen resté `true`, que l'écran ne voit pas
 * changer, donc un m2 jamais marqué. Et un non-lu qui reste éteint la trace de ce fil côté API.
 * L'id, lui, change à chaque nouvel entrant.
 *
 * `lastReadAt` à `null` : rien n'a encore été lu, tout l'entrant est à lire. `null` en sortie pour
 * « rien à marquer », mais aussi pour une session inconnue : sans savoir qui lit, on ne sait pas ce
 * qui est entrant — ses propres messages ne sont pas « à lire ».
 */
export function lastUnreadIncomingId(
  messages: readonly MessageDto[],
  currentUserId: string | null,
  lastReadAt: string | null,
): string | null {
  if (currentUserId == null) return null;
  const unread = messages.filter(
    (message) =>
      message.senderId !== currentUserId &&
      (lastReadAt == null || Date.parse(message.createdAt) > Date.parse(lastReadAt)),
  );
  return unread.at(-1)?.id ?? null;
}

type ReadMarkSource = Pick<ConversationDto, "lastReadAt">;

/**
 * MA marque de lecture sur le fil ouvert (#611), à donner à `lastUnreadIncomingId`. Celle de la
 * liste des fils d'abord : `markRead` l'invalide, elle suit donc mes lectures. Le fil RÉSOLU
 * (get-or-create) est figé, pour ne pas rejouer la résolution : sa marque a l'âge de l'ouverture,
 * et ne sert que tant que la liste ne porte pas encore le fil — créé à l'instant, ou par l'autre
 * depuis le dernier sondage.
 *
 * `null` : rien lu encore, ou aucun des deux chargé — et sans fil résolu, rien ne se marque.
 */
export function readMarkOf(
  listed: ReadMarkSource | null | undefined,
  resolved: ReadMarkSource | undefined,
): string | null {
  return (listed ?? resolved)?.lastReadAt ?? null;
}

/**
 * La mémoire du marquage d'UN fil monté : quel id est déjà parti, pour ne pas le renvoyer à chaque
 * sondage — et le renvoyer quand même s'il a échoué.
 *
 * Sans elle, un `markRead` en échec n'était jamais retenté tant que le fil restait ouvert : l'id
 * cible ne change pas, rien ne relançait. Relâché, il repart au sondage suivant — au rythme du
 * fil, sans marteler l'API, et seulement si la lecture des messages, elle, passe.
 */
export type ReadMarker = {
  /** Vrai si `target` doit partir maintenant ; il est alors réclamé. `null` ne part jamais. */
  claim: (target: string | null) => boolean;
  /** Après un échec : `target` repartira au prochain `claim`. Sans effet s'il a été supplanté. */
  release: (target: string) => void;
};

export function createReadMarker(): ReadMarker {
  let claimed: string | null = null;

  return {
    claim: (target) => {
      if (target == null || target === claimed) return false;
      claimed = target;
      return true;
    },
    release: (target) => {
      if (claimed === target) claimed = null;
    },
  };
}
