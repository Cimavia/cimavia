import type { MessageDto } from "../dto/message.schema";

/**
 * Le message qui déclenche le marquage lu d'un fil : le DERNIER entrant non lu, par son id.
 *
 * POURQUOI un id et pas « y a-t-il un entrant non lu ? » (#305). `markRead` ne recharge pas les
 * messages : le `readAt` du premier entrant reste `null` dans le cache jusqu'au sondage suivant.
 * Un second entrant arrivé entre-temps rend `[m1 lu, m2 non lu]` — un booléen resté `true`, que
 * l'écran ne voit pas changer, donc un m2 jamais marqué. Et un non-lu qui reste éteint le push de
 * ce fil côté API (`unreadFromMe`). L'id, lui, change à chaque nouvel entrant.
 *
 * `null` pour « rien à marquer », mais aussi pour une session inconnue : sans savoir qui lit, on ne
 * sait pas ce qui est entrant — ses propres messages ne sont pas « à lire ».
 */
export function lastUnreadIncomingId(
  messages: readonly MessageDto[],
  currentUserId: string | null,
): string | null {
  if (currentUserId == null) return null;
  const unread = messages.filter(
    (message) => message.senderId !== currentUserId && message.readAt == null,
  );
  return unread.at(-1)?.id ?? null;
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
