import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/util/cn.util";

type CmvButtonVariant = "primary" | "secondary" | "change" | "ghost" | "danger";

const VARIANT_CLASSES: Record<CmvButtonVariant, string> = {
  primary: "bg-cmv-accent text-cmv-text-hi hover:bg-cmv-accent-hi",
  secondary:
    "border border-cmv-border bg-cmv-surface-hi text-cmv-text-hi hover:border-cmv-border-hi",
  // Un secondaire qui dit un changement : le texte prend l'orange des informations de changement.
  change:
    "border border-cmv-border bg-cmv-surface-hi text-cmv-accent-on hover:border-cmv-border-hi",
  ghost: "text-cmv-text-mid hover:bg-cmv-surface-hi hover:text-cmv-text-hi",
  danger: "text-cmv-error hover:bg-cmv-surface-hi",
};

type CmvButtonProps = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "disabled" | "onClick" | "title"
> & {
  children: ReactNode;
  variant?: CmvButtonVariant;
  fullWidth?: boolean;
};

/**
 * `max-w-full break-words` : un libellé qui cite un texte du Coach — « Ajouter un exercice à
 * <libellé> », un nom de fichier — ne dépasse jamais son conteneur (#584). `break-words` et non
 * `wrap-anywhere` : un libellé ordinaire garde ses mots entiers quand sa rangée se resserre, seul
 * un mot plus large que le conteneur se coupe.
 */
export function CmvButton({
  children,
  type = "button",
  disabled,
  onClick,
  title,
  variant = "primary",
  fullWidth = false,
}: CmvButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        "max-w-full break-words rounded-cmv-md px-cmv-lg py-cmv-sm text-cmv-caption transition-colors disabled:opacity-50",
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
      )}
    >
      {children}
    </button>
  );
}
