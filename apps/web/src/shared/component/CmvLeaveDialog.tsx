import { type SyntheticEvent, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CmvButton } from "./CmvButton";

type CmvLeaveDialogProps = {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
};

/**
 * « Quitter sans enregistrer ? » — la confirmation de `useLeaveGuard` (#327).
 *
 * Un `<dialog>` ouvert en MODAL et non `window.confirm`, que l'on ne peut ni styler ni traduire
 * (même raison que `CmvConfirmButton`). `showModal` rend l'écran dessous inerte et retient le
 * focus dans la fenêtre : un Tab ne doit pas ramener au champ que le coach s'apprêtait à perdre.
 *
 * « Rester » vient EN PREMIER : c'est lui que `showModal` focalise, si bien qu'Entrée et Échap
 * ne font jamais partir la saisie.
 *
 * Rendu dans `body` et non sous l'écran : une session perdue rend l'écran `inert` (`CmvRoleGate`),
 * et le dialogue y serait inerte avec lui — « Changer de compte » laissait alors le coach devant
 * deux boutons qui ne répondaient plus.
 */
export function CmvLeaveDialog({ open, onStay, onLeave }: Readonly<CmvLeaveDialogProps>) {
  if (!open) return null;
  return <LeaveDialog onStay={onStay} onLeave={onLeave} />;
}

function LeaveDialog({ onStay, onLeave }: Readonly<Omit<CmvLeaveDialogProps, "open">>) {
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  // Ouvert à son montage, retiré du DOM (donc refermé) au démontage : l'état vit chez le routeur.
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Échap déclenche `cancel`, qui fermerait la fenêtre sans rien dire au routeur — la navigation
  // resterait suspendue. Il vaut « Rester ».
  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onStay();
  }

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onCancel}
      className="w-full max-w-sm rounded-xl border border-cmv-border bg-cmv-surface p-6 backdrop:bg-cmv-bg-0/70"
    >
      <h2 id={titleId} className="mb-2 text-cmv-title text-cmv-text-hi">
        {t("common.leave.title")}
      </h2>
      <p className="mb-6 text-cmv-body text-cmv-text-mid">{t("common.leave.body")}</p>
      <div className="flex justify-end gap-cmv-sm">
        <CmvButton onClick={onStay}>{t("common.leave.stay")}</CmvButton>
        <CmvButton variant="danger" onClick={onLeave}>
          {t("common.leave.leave")}
        </CmvButton>
      </div>
    </dialog>,
    document.body,
  );
}
