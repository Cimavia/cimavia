import { cn } from "@/shared/util/cn.util";

/**
 * Une case à cocher DESSINÉE plutôt qu'un `<input type=checkbox>` : la ligne entière est déjà un
 * bouton qui bascule (`aria-pressed`), et imbriquer un contrôle dans un bouton produirait deux
 * cibles de clic pour une seule intention. D'où `aria-hidden` : l'état est annoncé par le bouton.
 */
export function CmvCheckmark({ checked }: Readonly<{ checked: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-cmv-sm border text-cmv-caption",
        checked
          ? "border-cmv-accent-line bg-cmv-accent-soft text-cmv-accent-on"
          : "border-cmv-border",
      )}
    >
      {checked ? "✓" : null}
    </span>
  );
}
