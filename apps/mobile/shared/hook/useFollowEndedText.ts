import { useTranslation } from "react-i18next";
import { formatInstantDate } from "@/shared/util/date.util";

/**
 * « Suivi terminé le 20 nov. 2026 » (#911, pendant du hook web de #910) — la phrase que portent une
 * archive, une séance, un débrief et un fil dont le lien est rompu. Une seule tournure pour tous :
 * c'est le même fait, lu partout.
 *
 * Sans date (contrat du DTO rompu), la phrase se dit sans elle : jamais une date inventée.
 */
export function useFollowEndedText(): (endedAt: string | null) => string {
  const { t } = useTranslation();
  return (endedAt) =>
    endedAt == null ? t("follow.ended") : t("follow.endedOn", { date: formatInstantDate(endedAt) });
}
