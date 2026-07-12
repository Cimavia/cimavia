import type { ReactNode } from "react";
import { cn } from "@/shared/util/cn.util";

type CmvCardProps = {
  children: ReactNode;
  className?: string;
  // Rend la carte cliquable (survol accentué) — omis = carte statique.
  onClick?: () => void;
};

export function CmvCard({ children, className, onClick }: CmvCardProps) {
  const base = "rounded-cmv-lg border border-cmv-border bg-cmv-surface p-cmv-lg";

  if (onClick == null) {
    return <div className={cn(base, className)}>{children}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "w-full cursor-pointer text-left transition-colors hover:border-cmv-border-hi hover:bg-cmv-surface-hi",
        className,
      )}
    >
      {children}
    </button>
  );
}
