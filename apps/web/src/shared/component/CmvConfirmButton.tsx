import { type ReactNode, useState } from "react";
import { CmvButton } from "./CmvButton";

type CmvConfirmButtonProps = {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  /**
   * Contenu du bouton au repos, quand `label` ne doit pas s'écrire — une icône dans une rangée
   * d'actions serrée. `label` reste utilisé comme intitulé accessible, jamais perdu.
   */
  icon?: ReactNode;
  /**
   * Ce que la confirmation engage, écrit UNE FOIS le bouton armé. Au repos il n'y a rien à
   * avertir ; armé, c'est le dernier moment où le dire. Omis, le bouton se comporte comme avant.
   */
  confirmHint?: string;
};

/**
 * Action destructive en deux temps : un 1er clic « arme » le bouton, le 2e confirme.
 * Évite `window.confirm` (non stylable, non traduisible par i18next) tout en protégeant
 * d'un clic accidentel.
 */
export function CmvConfirmButton({
  label,
  confirmLabel,
  cancelLabel,
  onConfirm,
  disabled,
  icon,
  confirmHint,
}: Readonly<CmvConfirmButtonProps>) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <CmvButton
        variant={icon == null ? "danger" : "ghost"}
        title={label}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {icon ?? label}
      </CmvButton>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-cmv-xs">
      {confirmHint == null ? null : (
        <span className="text-cmv-caption text-cmv-text-mid">{confirmHint}</span>
      )}
      <CmvButton
        variant="danger"
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </CmvButton>
      <CmvButton variant="ghost" disabled={disabled} onClick={() => setArmed(false)}>
        {cancelLabel}
      </CmvButton>
    </div>
  );
}
