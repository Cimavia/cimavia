import type { ReactNode } from "react";
import { cn } from "@/shared/util/cn.util";

type CmvBadgeVariant = "neutral" | "accent";

const VARIANT_CLASSES: Record<CmvBadgeVariant, string> = {
  neutral: "border border-cmv-border bg-cmv-bg-1 text-cmv-text-mid",
  accent: "bg-cmv-accent-soft text-cmv-accent",
};

type CmvBadgeProps = {
  children: ReactNode;
  variant?: CmvBadgeVariant;
};

// Pastille d'information (catégorie d'exercice, compteur…).
export function CmvBadge({ children, variant = "neutral" }: CmvBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-cmv-pill px-cmv-sm py-cmv-xs text-cmv-caption",
        VARIANT_CLASSES[variant],
      )}
    >
      {children}
    </span>
  );
}
