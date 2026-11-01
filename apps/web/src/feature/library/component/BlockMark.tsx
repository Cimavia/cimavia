import { cn } from "@/shared/util/cn.util";

type BlockMarkProps = {
  /** « 1 » pour un bloc, « 1.2 » pour un exercice. */
  mark: string;
  kind: "block" | "exercise";
  /** Retiré pour l'athlète (#744) : le carré se barre, comme le nom d'un bloc à libellé. */
  removed?: boolean;
};

/**
 * Le numéro d'un bloc, ou le code d'un exercice, dans un carré à bordure (#719) : la bordure le
 * distingue du nom qui le suit — « 1 Gainage » ne se lit pas comme un titre qui commence par 1.
 */
export function BlockMark({ mark, kind, removed = false }: Readonly<BlockMarkProps>) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center justify-center rounded-cmv-sm border tabular-nums",
        removed
          ? "border-cmv-border border-dashed text-cmv-text-lo line-through"
          : "border-cmv-border-hi bg-cmv-surface-hi text-cmv-text-hi",
        kind === "block"
          ? "w-7 font-bold font-cmv-display text-cmv-body"
          : "min-w-9 px-cmv-sm font-cmv-mono font-semibold text-cmv-caption",
      )}
    >
      {mark}
    </span>
  );
}
