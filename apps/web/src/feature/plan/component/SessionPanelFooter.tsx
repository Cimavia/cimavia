import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvConfirmButton } from "@/shared/component";

type SessionPanelFooterProps = {
  /** La séance d'un cycle ouvert en Lecture (#607) : « Fermer », rien d'autre. */
  readOnly: boolean;
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
  /** Une valeur refusée reste à l'écran sans entrer dans la séance : enregistrer est fermé (#566). */
  hasRefused: boolean;
  onDelete: () => void;
  onClose: () => void;
  onSubmit: (event: SyntheticEvent) => void;
};

// Pied du panneau de séance : supprimer (édition seulement), annuler, enregistrer.
export function SessionPanelFooter({
  readOnly,
  isEditing,
  isDebriefed,
  isPublished,
  isBusy,
  canSubmit,
  hasRefused,
  onDelete,
  onClose,
  onSubmit,
}: Readonly<SessionPanelFooterProps>) {
  const { t } = useTranslation();
  if (readOnly) {
    return (
      <>
        <div className="flex-1" />
        <CmvButton onClick={onClose}>{t("common.close")}</CmvButton>
      </>
    );
  }
  // Omis plutôt qu'`undefined` (`exactOptionalPropertyTypes`) : un brouillon n'a rien à annoncer.
  const deleteHint = isPublished ? { confirmHint: t("plan.session.deleteHintPublished") } : {};
  // Ferme le bouton ET en devient l'infobulle : une seule valeur pour les deux (#514).
  const blockedBy = hasRefused ? t("library.builder.refusedBlocksSave") : undefined;
  const deleteBlocked = isDebriefed
    ? { disabledReason: t("plan.session.deleteDisabledDebriefed") }
    : {};

  return (
    <>
      {isEditing ? (
        <CmvConfirmButton
          label={t("plan.session.delete")}
          confirmLabel={t("common.confirmDelete")}
          cancelLabel={t("common.cancel")}
          disabled={isBusy}
          {...deleteHint}
          {...deleteBlocked}
          onConfirm={onDelete}
        />
      ) : null}
      <div className="flex-1" />
      <CmvButton variant="ghost" onClick={onClose} disabled={isBusy}>
        {t("common.cancel")}
      </CmvButton>
      <CmvButton
        type="submit"
        onClick={onSubmit}
        disabled={isBusy || !canSubmit || blockedBy != null}
        title={blockedBy}
      >
        {isBusy ? t("plan.session.submitting") : t("plan.session.submit")}
      </CmvButton>
    </>
  );
}
