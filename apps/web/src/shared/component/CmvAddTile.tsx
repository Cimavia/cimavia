import { useId } from "react";
import { IoAdd } from "react-icons/io5";
import { cn } from "@/shared/util/cn.util";

type CmvAddTileProps = {
  label: string;
  /** Ce que l'ajout fera, à droite : « crée un bloc Séries », « arrivera en 1.3 ». */
  hint?: string | undefined;
  onClick: () => void;
  /** Les props d'une cible de dépôt, quand la tuile en est une. */
  dropProps?: object;
  isDropTarget?: boolean;
};

/**
 * Une tuile d'ajout pleine largeur, à bordure pointillée : « + », le geste, et son indice à droite.
 * L'indice décrit le bouton sans le nommer — le nom reste le geste.
 */
export function CmvAddTile({
  label,
  hint,
  onClick,
  dropProps,
  isDropTarget = false,
}: Readonly<CmvAddTileProps>) {
  const hintId = useId();
  return (
    <button
      type="button"
      {...dropProps}
      onClick={onClick}
      aria-label={label}
      aria-describedby={hint == null ? undefined : hintId}
      className={cn(
        "flex w-full flex-wrap items-center gap-cmv-sm rounded-cmv-md border border-cmv-border border-dashed px-cmv-lg py-cmv-md text-left text-cmv-text-hi transition-colors hover:border-cmv-border-hi",
        isDropTarget && "bg-cmv-accent-soft",
      )}
    >
      <IoAdd aria-hidden className="shrink-0" />
      <span className="font-semibold text-cmv-caption">{label}</span>
      {hint == null ? null : (
        <span id={hintId} className="ml-auto text-cmv-caption text-cmv-text-lo">
          {hint}
        </span>
      )}
    </button>
  );
}
