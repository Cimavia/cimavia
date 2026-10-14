import { cn } from "@/shared/util/cn.util";

/** La pastille des choix — unique (`CmvChoiceChips`) ou à bascule (`CmvToggleChip`) : un seul dessin. */
export function chipClass(pressed: boolean): string {
  return cn(
    "rounded-cmv-pill border px-cmv-md py-cmv-xs text-cmv-caption transition-colors",
    pressed
      ? "border-cmv-accent-line bg-cmv-accent-soft text-cmv-accent-on"
      : "border-cmv-border bg-cmv-surface text-cmv-text-mid hover:text-cmv-text-hi",
  );
}
