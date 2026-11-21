import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/util/cn.util";

type CmvButtonVariant = "primary" | "secondary" | "change" | "ghost" | "danger";

/**
 * Toutes les variantes portent une bordure (`border` dans la base) : sans elle, `ghost` et `danger`
 * se lisaient comme un libellé, et le Coach ne savait pas ce qui se clique (#579). `primary` la
 * garde transparente, sinon il perdrait 2 px sur un voisin bordé d'un même pied de page. La
 * bordure de `danger` reste neutre : le texte porte déjà le danger.
 */
const VARIANT_CLASSES: Record<CmvButtonVariant, string> = {
  primary:
    "border-transparent bg-cmv-accent-fill text-cmv-text-on-fill hover:bg-cmv-accent-fill-hover",
  secondary: "border-cmv-border bg-cmv-surface-hi text-cmv-text-hi hover:border-cmv-border-hi",
  // Un secondaire qui dit un changement : le texte prend l'orange des informations de changement.
  change: "border-cmv-border bg-cmv-surface-hi text-cmv-accent-on hover:border-cmv-border-hi",
  ghost:
    "border-cmv-border text-cmv-text-mid hover:border-cmv-border-hi hover:bg-cmv-surface-hi hover:text-cmv-text-hi",
  danger: "border-cmv-border text-cmv-error-on hover:border-cmv-border-hi hover:bg-cmv-surface-hi",
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
        "max-w-full break-words rounded-cmv-md border px-cmv-lg py-cmv-sm text-cmv-caption transition-colors disabled:opacity-50",
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
      )}
    >
      {children}
    </button>
  );
}
