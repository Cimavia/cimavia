import type { ConversationDto, TrainingCapability } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import type { CmvArchiveAction } from "@/shared/component/CmvArchiveList";
import { useCapabilitySwitch } from "@/shared/hook/useExercisedCapability";
import { openUnder } from "@/shared/lib/open-under";

/**
 * « Relire le fil » d'une ligne d'archive (#911) : le fil direct du couple, ouvert par son id sous
 * le titre `as` — un compte double venu de l'autre espace y bascule d'abord. Sans fil (jamais
 * écrit, ou liste pas encore lue), rien à relire : aucune action, plutôt qu'un bouton qui
 * n'ouvrirait rien. Partagé par « Mes coachs » et le tableau de bord, qui ne diffèrent que du titre.
 */
export function useArchiveThreadActions(
  as: TrainingCapability,
): (thread: ConversationDto | null) => CmvArchiveAction[] {
  const { t } = useTranslation();
  const capabilitySwitch = useCapabilitySwitch();
  return (thread) =>
    thread == null
      ? []
      : [
          {
            label: t("follow.archive.thread"),
            onPress: () => openUnder(`/messages/${thread.id}`, as, capabilitySwitch),
          },
        ];
}
