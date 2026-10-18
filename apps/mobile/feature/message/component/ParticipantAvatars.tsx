import type { ConversationParticipantDto } from "@cmv/shared";
import { View } from "react-native";
import { CmvAvatar } from "@/shared/component";

type ParticipantAvatarsProps = {
  participants: readonly Pick<ConversationParticipantDto, "userId" | "name">[];
  /** Combien de pastilles au plus : la liste en montre deux, l'en-tête d'un fil trois. */
  max: number;
};

// Plus personne (compte effacé, MC-18) : une pastille vide plutôt qu'un trou dans la ligne.
const NOBODY = [{ userId: "", name: "" }];

/**
 * Les pastilles des AUTRES participants d'une conversation, en éventail — même règle que le web :
 * neutres (tranché en #598), décoratives, le titre écrit à côté nommant déjà chacun.
 */
export function ParticipantAvatars({ participants, max }: Readonly<ParticipantAvatarsProps>) {
  const shown = participants.length === 0 ? NOBODY : participants.slice(0, max);

  return (
    <View className="shrink-0 flex-row" accessibilityElementsHidden>
      {shown.map((participant, index) => (
        <View key={participant.userId} className={index === 0 ? "" : "-ml-4"}>
          <CmvAvatar name={participant.name} />
        </View>
      ))}
    </View>
  );
}
