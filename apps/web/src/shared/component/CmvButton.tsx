import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/util/cn.util";

type CmvButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<CmvButtonVariant, string> = {
  primary: "bg-cmv-accent text-cmv-text-hi hover:bg-cmv-accent-hi",
  secondary:
    "border border-cmv-border bg-cmv-surface-hi text-cmv-text-hi hover:border-cmv-border-hi",
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
        "rounded-cmv-md px-cmv-lg py-cmv-sm text-cmv-caption transition-colors disabled:opacity-50",
        VARIANT_CLASSES[variant],
        fullWidth && "w-full",
      )}
    >
      {children}
    </button>
  );
}
