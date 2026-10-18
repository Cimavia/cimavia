import { useTranslation } from "react-i18next";
import { CmvButton, CmvConfirmButton, CmvFormError } from "@/shared/component";
import { isStaleWriteError } from "@/shared/lib/api";

type BuilderActionsProps = {
  /** Lecture (#606) : « Fermer », à la place d'Enregistrer et Supprimer (frame 12). */
  readOnly: boolean;
  deleteLabel: string;
  /** Ce que la suppression engage, écrit une fois le bouton armé — les copies figées (#609). */
  deleteHint?: string | undefined;
  /**
   * La suppression, ou `null` quand elle n'est pas offerte : l'élément naît, ou il n'est pas à
   * l'acteur — supprimer reste au propriétaire, même à qui a l'Écriture (#605).
   */
  onDelete: (() => void) | null;
  isDeleting: boolean;
  /**
   * Le refus de la suppression, à lire sous les actions — sauf un conflit d'édition : l'écran le
   * dit par son bandeau, comme pour l'enregistrement, avec de quoi recharger.
   */
  deleteError: unknown;
  isSaving: boolean;
  /**
   * Une écriture de la saisie est en vol — l'enregistrement, et pour une séance le rechargement
   * d'un exercice. Avec la suppression, elles passent une à la fois : lancées ensemble, elles
   * citeraient la même version.
   */
  isWriting: boolean;
  submitLabel: string;
  canSubmit: boolean;
  /**
   * Pourquoi l'enregistrement est fermé alors que le titre est là — une saisie refusée (#566).
   * Ferme le bouton ET en devient l'infobulle : une seule valeur pour les deux, sans quoi le bouton
   * pourrait annoncer un refus qu'il ne fait pas (#514).
   */
  blockedBy: string | undefined;
  onCancel: () => void;
  onSubmit: () => void;
};

/** Les actions d'en-tête des constructeurs d'exercice et de séance, selon le droit de l'acteur. */
export function BuilderActions({
  readOnly,
  deleteLabel,
  deleteHint,
  onDelete,
  isDeleting,
  deleteError,
  isSaving,
  isWriting,
  submitLabel,
  canSubmit,
  blockedBy,
  onCancel,
  onSubmit,
}: Readonly<BuilderActionsProps>) {
  const { t } = useTranslation();
  const isBusy = isWriting || isDeleting;

  if (readOnly) return <CmvButton onClick={onCancel}>{t("common.close")}</CmvButton>;

  return (
    <>
      {onDelete == null ? null : (
        <CmvConfirmButton
          label={deleteLabel}
          confirmLabel={t("common.confirmDelete")}
          cancelLabel={t("common.cancel")}
          confirmHint={deleteHint}
          disabled={isBusy}
          onConfirm={onDelete}
        />
      )}
      <CmvButton variant="ghost" onClick={onCancel} disabled={isSaving || isDeleting}>
        {t("library.builder.cancel")}
      </CmvButton>
      <CmvButton
        onClick={onSubmit}
        disabled={isBusy || !canSubmit || blockedBy != null}
        title={blockedBy}
      >
        {submitLabel}
      </CmvButton>
      <CmvFormError error={isStaleWriteError(deleteError) ? null : deleteError} />
    </>
  );
}
