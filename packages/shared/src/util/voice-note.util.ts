import { type FeedbackMediaDto, MediaType } from "../dto/feedback.schema";
import { type MessageDto, MessageType } from "../dto/message.schema";

/**
 * La note vocale qui suit `id` parmi les médias d'un débrief, dans l'ordre reçu de l'API — celui
 * de l'affichage, aux photos et vidéos près, qu'on saute (#529). Un débrief n'est pas une
 * conversation : rien ne s'intercale entre deux notes, une photo ne fait que les séparer.
 *
 * `null` à la dernière note, mais aussi pour un `id` absent de la liste : sans savoir d'où l'on
 * part, on n'enchaîne pas.
 */
export function nextVoiceNoteInFeedback(
  media: readonly Pick<FeedbackMediaDto, "id" | "type">[],
  id: string,
): string | null {
  const index = media.findIndex((item) => item.id === id);
  if (index === -1) return null;
  return media.slice(index + 1).find((item) => item.type === MediaType.AUDIO)?.id ?? null;
}

/**
 * Le message qui suit `id` dans un fil chronologique, s'il est vocal — quel que soit son auteur
 * (#529). Tout autre message arrête l'enchaînement, comme sur WhatsApp : un texte, une photo, une
 * vidéo, et aussi un avis de débrief, qui se lit et ne s'écoute pas.
 *
 * Une note SANS média s'arrête aussi : sa bulle est vide, il n'y a rien à jouer.
 */
export function nextVoiceNoteInThread(
  messages: readonly Pick<MessageDto, "id" | "type" | "media">[],
  id: string,
): string | null {
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) return null;
  const next = messages[index + 1];
  return next?.type === MessageType.AUDIO && next.media != null ? next.id : null;
}

/**
 * Une seule note vocale à la fois, à l'échelle de l'app : lancer une note met en pause celle qui
 * joue, qu'elle soit dans la même liste ou non (#529). Sans elle, l'enchaînement partirait
 * par-dessus une note relancée à la main.
 *
 * Les vidéos n'y entrent pas : la règle est celle des notes vocales, et une vidéo peut jouer
 * par-dessus.
 */
export type VoiceNoteFocus = {
  /**
   * `stop` devient la note qui joue ; la précédente est arrêtée par le sien. Rend de quoi céder la
   * place — sans effet si une autre note l'a prise depuis.
   */
  take: (stop: () => void) => () => void;
};

/** Une instance par app, comme `createSignedUrlSharing` : c'est elle qui voit tous les lecteurs. */
export function createVoiceNoteFocus(): VoiceNoteFocus {
  let current: (() => void) | null = null;

  return {
    take: (stop) => {
      if (current != null && current !== stop) current();
      current = stop;
      return () => {
        if (current === stop) current = null;
      };
    },
  };
}

/** Ce qu'une liste dit à UN lecteur de note vocale pour l'enchaîner aux autres. */
export type VoiceNoteCue = {
  /** La note précédente vient de finir : celle-ci doit démarrer, au début. */
  cued: boolean;
  /** La note démarre, à la main ou sur demande : toute demande en attente dans la liste tombe. */
  onPlay: () => void;
  /** La note est allée au bout EN JOUANT : la suivante est demandée, s'il y en a une. */
  onFinish: () => void;
};

export type VoiceNoteChain = {
  cueOf: (id: string) => VoiceNoteCue;
  /**
   * La note demandée. Une liste virtualisée (`FlatList`) ne redessine ses lignes que sur ses
   * données : il faut la lui passer en `extraData`, sinon aucune bulle ne la voit.
   */
  cuedId: string | null;
};

type UseState = <S>(initial: S) => [S, (next: S) => void];

/**
 * Compose le hook d'enchaînement à partir du `useState` de l'app — même dispositif que
 * `createAthleteLabelHooks` (#505), pour qu'il ne s'écrive pas deux fois.
 *
 * C'est la LISTE qui tient l'enchaînement, pas les lecteurs : sur mobile, la note suivante d'une
 * `FlatList` peut ne pas être montée, et un lecteur ne peut donc pas passer la main à un autre
 * par référence. La liste retient qui doit démarrer ; le lecteur concerné démarre quand il le voit.
 */
export function createVoiceNoteChainHooks(useState: UseState) {
  function useVoiceNoteChain(nextOf: (id: string) => string | null): VoiceNoteChain {
    const [cuedId, setCuedId] = useState<string | null>(null);

    return {
      cuedId,
      cueOf: (id) => ({
        cued: cuedId === id,
        onPlay: () => setCuedId(null),
        onFinish: () => setCuedId(nextOf(id)),
      }),
    };
  }

  return { useVoiceNoteChain };
}
