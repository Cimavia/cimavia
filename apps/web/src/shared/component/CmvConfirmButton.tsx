import { useState } from "react";
import { CmvButton } from "./CmvButton";

type CmvConfirmButtonProps = {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
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
}: Readonly<CmvConfirmButtonProps>) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <CmvButton variant="danger" disabled={disabled} onClick={() => setArmed(true)}>
        {label}
      </CmvButton>
    );
  }

  return (
    <div className="flex items-center gap-cmv-xs">
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
