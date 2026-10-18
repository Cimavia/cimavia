import type { FrozenFrom } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatInstantDate } from "@/shared/util/date.util";

type FrozenBadgeProps = {
  /**
   * La provenance de la copie, ou `null` pour un exercice ordinaire : rien ne s'affiche. `undefined`
   * pour un exercice qui naît, pas encore lu.
   */
  frozenFrom: FrozenFrom | null | undefined;
  /** La place du badge dans son parent — son écart avec ce qui suit, par exemple. */
  className?: string;
};

/**
 * « Copie figée — d'après C » (#609) : l'exercice qu'une séance a gardé quand C l'a supprimé ou en
 * a fermé l'accès. Le badge reste après modification — la copie dit d'où elle vient, pas qu'elle
 * est restée identique. Sans Coach d'origine (compte supprimé depuis), « Copie figée » seul.
 *
 * La date passe en infobulle : elle répond à « depuis quand », que la liste ne pose pas.
 */
export function FrozenBadge({ frozenFrom, className }: Readonly<FrozenBadgeProps>) {
  const { t } = useTranslation();
  if (frozenFrom == null) return null;
  const label =
    frozenFrom.coach == null
      ? t("library.frozen.badge")
      : t("library.frozen.badgeFrom", { owner: frozenFrom.coach.name });
  return (
    <span
      className={cn("inline-flex", className)}
      title={t("library.frozen.since", { date: formatInstantDate(frozenFrom.at) })}
    >
      <CmvBadge variant="info">{label}</CmvBadge>
    </span>
  );
}
