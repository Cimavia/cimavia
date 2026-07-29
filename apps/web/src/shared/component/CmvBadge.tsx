import type { ReactNode } from "react";
import { cn } from "@/shared/util/cn.util";

type CmvBadgeVariant = "neutral" | "accent" | "success" | "warning" | "error" | "info";

/**
 * Une pastille = fond `soft` + bordure `line` + texte `on`, jamais le `DEFAULT` d'une famille
 * (trop sombre pour du texte, cf. @cmv/tokens). `neutral` reste le cas sans signal : les neutres
 * granite n'ont pas de nuance `on`, le texte y est `text-mid`.
 */
const VARIANT_CLASSES: Record<CmvBadgeVariant, string> = {
  neutral: "border-cmv-border bg-cmv-surface-hi text-cmv-text-mid",
  accent: "border-cmv-accent-line bg-cmv-accent-soft text-cmv-accent-on",
  success: "border-cmv-success-line bg-cmv-success-soft text-cmv-success-on",
  warning: "border-cmv-warning-line bg-cmv-warning-soft text-cmv-warning-on",
  error: "border-cmv-error-line bg-cmv-error-soft text-cmv-error-on",
  info: "border-cmv-info-line bg-cmv-info-soft text-cmv-info-on",
};

type CmvBadgeProps = {
  children: ReactNode;
  variant?: CmvBadgeVariant;
  /** Puce colorée en tête (maquette design system) : réservée aux ÉTATS, pas aux catégories. */
  dot?: boolean;
};

export function CmvBadge({ children, variant = "neutral", dot = false }: Readonly<CmvBadgeProps>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-cmv-xs rounded-cmv-sm border px-cmv-md py-cmv-xs text-cmv-caption font-semibold",
        VARIANT_CLASSES[variant],
      )}
    >
      {/* La puce hérite de la couleur du texte (`currentColor`) : un seul token par variant. */}
      {dot ? <span className="size-1.5 rounded-cmv-pill bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
