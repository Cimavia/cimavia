import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvConfirmButton } from "@/shared/component";

type SessionPanelFooterProps = {
  /** Édition : la séance existe déjà, donc elle peut être supprimée. */
  isEditing: boolean;
  /**
   * La séance a été débriefée (`DONE`) : la supprimer emporterait le débrief de l'athlète, l'API
   * la refuse (#313). Le bouton reste visible, grisé, pour dire POURQUOI il ne sert pas.
   */
  isDebriefed: boolean;
  /** Cycle diffusé : l'athlète est prévenu du retrait, le coach doit le savoir avant de confirmer. */
  isPublished: boolean;
  isBusy: boolean;
  canSubmit: boolean;
  onDelete: () => void;
  onClose: () => void;
  onSubmit: (event: SyntheticEvent) => void;
};

// Pied du panneau de séance : supprimer (édition seulement), annuler, enregistrer.
export function SessionPanelFooter({
  isEditing,
  isDebriefed,
  isPublished,
  isBusy,
  canSubmit,
  onDelete,
  onClose,
  onSubmit,
}: Readonly<SessionPanelFooterProps>) {
  const { t } = useTranslation();
  // Omis plutôt qu'`undefined` (`exactOptionalPropertyTypes`) : un brouillon n'a rien à annoncer.
  const deleteHint = isPublished ? { confirmHint: t("plan.session.deleteHintPublished") } : {};
  const deleteBlockedTitle = isDebriefed ? t("plan.session.deleteDisabledDebriefed") : undefined;

  return (
    <>
      {/* Info-bulle sur un span : le `title` d'un bouton désactivé ne s'affiche pas partout. */}
      {isEditing ? (
        <span title={deleteBlockedTitle}>
          <CmvConfirmButton
            label={t("plan.session.delete")}
            confirmLabel={t("common.confirmDelete")}
            cancelLabel={t("common.cancel")}
            disabled={isBusy || isDebriefed}
            {...deleteHint}
            onConfirm={onDelete}
          />
        </span>
      ) : null}
      <div className="flex-1" />
      <CmvButton variant="ghost" onClick={onClose} disabled={isBusy}>
        {t("common.cancel")}
      </CmvButton>
      <CmvButton type="submit" onClick={onSubmit} disabled={isBusy || !canSubmit}>
        {isBusy ? t("plan.session.submitting") : t("plan.session.submit")}
      </CmvButton>
    </>
  );
}
