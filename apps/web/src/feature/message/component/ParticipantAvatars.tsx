import type { ConversationParticipantDto } from "@cmv/shared";
import { CmvAvatar } from "@/shared/component";

type ParticipantAvatarsProps = {
  participants: readonly Pick<ConversationParticipantDto, "userId" | "name">[];
  /** Combien de pastilles au plus : la liste en montre deux, l'en-tête d'un fil trois. */
  max: number;
};

// Plus personne (compte effacé, MC-18) : une pastille vide plutôt qu'un trou dans la ligne.
const NOBODY = [{ userId: "", name: "" }];

/**
 * Les pastilles des AUTRES participants d'une conversation, en éventail. Neutres, comme toute
 * pastille (`CmvAvatar`) : la planche de #598 donnait une couleur par personne, prise dans les
 * teintes d'état — écart tranché, c'est le nom qui distingue les auteurs.
 *
 * Décoratives : le titre de la conversation, écrit à côté, nomme déjà chacun.
 */
export function ParticipantAvatars({ participants, max }: Readonly<ParticipantAvatarsProps>) {
  const shown = participants.length === 0 ? NOBODY : participants.slice(0, max);

  return (
    <span className="flex shrink-0">
      {shown.map((participant, index) => (
        <span
          key={participant.userId}
          className={
            index === 0 ? "rounded-cmv-md" : "-ml-cmv-md rounded-cmv-md ring-2 ring-cmv-bg-1"
          }
        >
          <CmvAvatar name={participant.name} />
        </span>
      ))}
    </span>
  );
}
