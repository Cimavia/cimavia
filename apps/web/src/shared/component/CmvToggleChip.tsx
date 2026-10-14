import type { ReactNode } from "react";
import { IoCheckmark } from "react-icons/io5";
import { cn } from "@/shared/util/cn.util";
import { chipClass } from "./chip.style";

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
 * Une pastille qui s'active et se désactive indépendamment de ses voisines — à la différence de
 * `CmvChoiceChips`, choix unique. La coche double la couleur : l'état se lit sans elle.
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
        "inline-flex items-center gap-cmv-xs",
        chipClass(pressed),
        locked != null && "cursor-not-allowed",
      )}
    >
      {pressed ? <IoCheckmark aria-hidden /> : null}
      {children}
    </button>
  );
}
