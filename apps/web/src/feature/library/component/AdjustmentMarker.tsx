import { AdjustmentLevel, type AdjustmentLevelType } from "@cmv/shared";
import { cn } from "@/shared/util/cn.util";

/**
 * Le marqueur d'une valeur ajustée. La FORME distingue les niveaux autant que la couleur — rond
 * pour la séance, carré pour l'athlète : les deux coexistent sur la même grille, et une couleur
 * seule serait illisible pour un daltonien.
 */
export function AdjustmentMarker({ level }: Readonly<{ level: AdjustmentLevelType }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0",
        level === AdjustmentLevel.SESSION
          ? "rounded-cmv-pill bg-cmv-accent"
          : "rounded-cmv-sm bg-cmv-info",
      )}
    />
  );
}
