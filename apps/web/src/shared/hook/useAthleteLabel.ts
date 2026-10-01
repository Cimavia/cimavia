import { createAthleteLabelHooks } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { authClient } from "@/shared/lib/auth";

/**
 * Nommer un athlète dans une liste de coach — « (moi) » quand c'est le compte courant (#14) — et
 * DÉCIDER si c'est lui : le volet de débrief ne peut pas offrir de répondre à soi-même (#198).
 *
 * Règle et composition vivent dans `@cmv/shared` (`createAthleteLabelHooks`) ; le web n'y apporte
 * que sa session et sa traduction.
 */
export const { useAthleteLabel, useIsSelfAthlete } = createAthleteLabelHooks(
  function useSelfId() {
    return authClient.useSession().data?.user.id;
  },
  function useTranslate() {
    return useTranslation().t;
  },
);
