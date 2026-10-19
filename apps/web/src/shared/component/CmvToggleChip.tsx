import type { ReactNode } from "react";
import { IoCheckmark } from "react-icons/io5";
import { cn } from "@/shared/util/cn.util";

type CmvToggleChipProps = {
  pressed: boolean;
  onToggle: () => void;
  /**
   * Verrouillée : la dernière bascule active d'un groupe qui n'en tolère aucune vide. Elle reste
   * atteignable au clavier — `aria-disabled` et non `disabled` —, et l'infobulle dit pourquoi.
   */
  locked?: string | undefined;
  children: ReactNode;
};

/**
 * Une pastille qui s'active et se désactive indépendamment de ses voisines. La coche double la
 * couleur : l'état se lit sans elle.
 */
export function CmvToggleChip({
  pressed,
  onToggle,
  locked,
  children,
}: Readonly<CmvToggleChipProps>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-disabled={locked != null}
      title={locked}
      onClick={locked == null ? onToggle : undefined}
      className={cn(
        "inline-flex items-center gap-cmv-xs rounded-cmv-pill border px-cmv-md py-cmv-xs text-cmv-caption transition-colors",
        pressed
          ? "border-cmv-accent-line bg-cmv-accent-soft text-cmv-accent-on"
          : "border-cmv-border bg-cmv-surface text-cmv-text-mid hover:text-cmv-text-hi",
        locked != null && "cursor-not-allowed",
      )}
    >
      {pressed ? <IoCheckmark aria-hidden /> : null}
      {children}
    </button>
  );
}
