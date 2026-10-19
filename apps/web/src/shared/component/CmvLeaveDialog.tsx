import { type SyntheticEvent, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { LeaveDialogProps } from "@/shared/hook/useLeaveGuard";
import { CmvButton } from "./CmvButton";

/**
 * « Enregistrer les modifications ? » — la question de `useLeaveGuard` (#327) et de la fermeture
 * d'un panneau, à trois sorties (#682) : enregistrer puis partir, partir sans enregistrer, rester.
 *
 * Un `<dialog>` ouvert en MODAL et non `window.confirm`, que l'on ne peut ni styler ni traduire
 * (même raison que `CmvConfirmButton`). `showModal` rend l'écran dessous inerte et retient le
 * focus dans la fenêtre : un Tab ne doit pas ramener au champ que le coach s'apprêtait à perdre.
 *
 * « Enregistrer » vient EN PREMIER : c'est lui que `showModal` focalise, si bien qu'Entrée garde
 * le travail ET part — ce que le coach veut le plus souvent. Échap vaut « Annuler » : aucune
 * touche ne fait perdre la saisie.
 *
 * Rendu dans `body` et non sous l'écran : une session perdue rend l'écran `inert` (`CmvRoleGate`),
 * et le dialogue y serait inerte avec lui — « Changer de compte » laissait alors le coach devant
 * des boutons qui ne répondaient plus.
 */
export function CmvLeaveDialog({ open, ...props }: Readonly<LeaveDialogProps>) {
  if (!open) return null;
  return <LeaveDialog {...props} />;
}

function LeaveDialog({
  isSaving,
  onSave,
  onDiscard,
  onCancel,
}: Readonly<Omit<LeaveDialogProps, "open">>) {
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  // Ouvert à son montage, retiré du DOM (donc refermé) au démontage : l'état vit chez la garde.
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Échap déclenche `cancel`, qui fermerait la fenêtre sans rien dire à la garde — la navigation
  // resterait suspendue. Il vaut « Annuler », sauf pendant l'envoi : rester laisserait partir un
  // enregistrement que plus rien n'attend.
  function onEscape(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!isSaving) onCancel();
  }

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onEscape}
      className="w-full max-w-md rounded-xl border border-cmv-border bg-cmv-surface p-6 backdrop:bg-cmv-bg-0/70"
    >
      <h2 id={titleId} className="mb-2 text-cmv-title text-cmv-text-hi">
        {t("common.leave.title")}
      </h2>
      <p className="mb-6 text-cmv-body text-cmv-text-mid">{t("common.leave.body")}</p>
      <div className="flex flex-wrap justify-end gap-cmv-sm">
        <CmvButton onClick={onSave} disabled={isSaving}>
          {isSaving ? t("common.saving") : t("common.leave.save")}
        </CmvButton>
        <CmvButton variant="danger" onClick={onDiscard} disabled={isSaving}>
          {t("common.leave.discard")}
        </CmvButton>
        <CmvButton variant="secondary" onClick={onCancel} disabled={isSaving}>
          {t("common.leave.cancel")}
        </CmvButton>
      </div>
    </dialog>,
    document.body,
  );
}
