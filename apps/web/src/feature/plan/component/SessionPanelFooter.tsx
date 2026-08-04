import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvConfirmButton } from "@/shared/component";

type SessionPanelFooterProps = {
  /** Édition : la séance existe déjà, donc elle peut être supprimée. */
  isEditing: boolean;
  isBusy: boolean;
  canSubmit: boolean;
  onDelete: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

// Pied du panneau de séance : supprimer (édition seulement), annuler, enregistrer.
export function SessionPanelFooter({
  isEditing,
  isBusy,
  canSubmit,
  onDelete,
  onClose,
  onSubmit,
}: Readonly<SessionPanelFooterProps>) {
  const { t } = useTranslation();

  return (
    <>
      {isEditing ? (
        <CmvConfirmButton
          label={t("plan.session.delete")}
          confirmLabel={t("common.confirmDelete")}
          cancelLabel={t("common.cancel")}
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
