import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { SessionDeleteButton } from "@/feature/plan/component/SessionDeleteButton";
import { CmvButton } from "@/shared/component";

type SessionPanelFooterProps = {
  /** La séance d'un cycle ouvert en Lecture (#607) : « Fermer », rien d'autre. */
  readOnly: boolean;
  /** Édition : la séance existe déjà, donc elle peut être supprimée. */
  isEditing: boolean;
  /** Séance débriefée (`DONE`) : la suppression reste visible, fermée (#313). */
  isDebriefed: boolean;
  /** Cycle diffusé : l'athlète est prévenu du retrait. */
  isPublished: boolean;
  isBusy: boolean;
  canSubmit: boolean;
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

  return (
    <>
      {isEditing ? (
        <SessionDeleteButton
          label={t("plan.session.delete")}
          isDebriefed={isDebriefed}
          isPublished={isPublished}
          disabled={isBusy}
          onConfirm={onDelete}
        />
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
