import type { ReactNode } from "react";
import { cn } from "@/shared/util/cn.util";

type CmvCardProps = {
  children: ReactNode;
  className?: string;
  /**
   * REMPLACE le fond et la bordure par défaut — pour une carte qui signale (cf. `DashboardTile`).
   *
   * Une prop à part, et non une classe de plus dans `className` : `cn` ne résout pas les conflits
   * Tailwind (choix assumé, cf. `cn.util.ts`), donc `bg-cmv-surface` et `bg-cmv-error-soft` se
   * retrouveraient toutes deux sur l'élément. L'ordre dans la CHAÎNE ne les départage pas — c'est
   * l'ordre de génération dans la feuille CSS qui tranche, et il ne dépend pas de nous. Le fond
   * d'alerte disparaissait ainsi sans que rien ne le signale.
   */
  surfaceClassName?: string;
  // Rend la carte cliquable (survol accentué) — omis = carte statique.
  onClick?: () => void;
};

export function CmvCard({ children, className, surfaceClassName, onClick }: CmvCardProps) {
  const surface = surfaceClassName ?? "border-cmv-border bg-cmv-surface";
  const base = cn("rounded-cmv-lg border p-cmv-lg", surface);

  if (onClick == null) {
    return <div className={cn(base, className)}>{children}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "w-full cursor-pointer text-left transition-colors",
        // Le survol par défaut vise la surface neutre : sur une carte qui signale, il écraserait
        // sa couleur au passage de la souris. Elle garde donc la sienne.
        surfaceClassName == null ? "hover:border-cmv-border-hi hover:bg-cmv-surface-hi" : "",
        className,
      )}
    >
      {children}
    </button>
  );
}
