import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CmvConfirmButton } from "@/shared/component";

type SessionDeleteButtonProps = {
  label: string;
  /** Sur la carte de la grille (#690), une poubelle : `label` reste son intitulé accessible. */
  icon?: ReactNode;
  /** Où se pose la confirmation armée — sous le titre, sur la carte de la grille. */
  armedClassName?: string;
  /**
   * La séance a été débriefée (`DONE`) : la supprimer emporterait le débrief de l'athlète, l'API
   * la refuse (#313). Le bouton reste visible, grisé, pour dire POURQUOI il ne sert pas.
   */
  isDebriefed: boolean;
  /** Cycle diffusé : l'athlète est prévenu du retrait, le coach doit le savoir avant de confirmer. */
  isPublished: boolean;
  disabled: boolean;
  onConfirm: () => void;
};

/**
 * Retirer une séance planifiée, depuis son panneau ou sa carte (#690) : les deux portent les
 * mêmes règles, écrites une fois. Le mode Lecture (#607) reste aux appelants, qui n'offrent alors
 * aucun geste.
 */
export function SessionDeleteButton({
  label,
  icon,
  armedClassName,
  isDebriefed,
  isPublished,
  disabled,
  onConfirm,
}: Readonly<SessionDeleteButtonProps>) {
  const { t } = useTranslation();
  // Omis plutôt qu'`undefined` (`exactOptionalPropertyTypes`) : un brouillon n'a rien à annoncer.
  const hint = isPublished ? { confirmHint: t("plan.session.deleteHintPublished") } : {};
  const blocked = isDebriefed ? { disabledReason: t("plan.session.deleteDisabledDebriefed") } : {};

  return (
    <CmvConfirmButton
      label={label}
      confirmLabel={t("common.confirmDelete")}
      cancelLabel={t("common.cancel")}
      disabled={disabled}
      icon={icon}
      armedClassName={armedClassName}
      {...hint}
      {...blocked}
      onConfirm={onConfirm}
    />
  );
}
