import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { IoEllipsisHorizontal } from "react-icons/io5";
import { useAnchoredPosition } from "@/shared/hook/useAnchoredPosition";
import { cn } from "@/shared/util/cn.util";

export type CmvMenuItem = {
  label: string;
  /** Ce que le geste fera, sous son libellé : « La copie arrive juste après A. » */
  hint?: string | undefined;
  onSelect: () => void;
  disabled?: boolean | undefined;
  /** Un geste qui retire : il se lit en rouge, en dernier. */
  danger?: boolean | undefined;
};

type CmvMenuProps = {
  /** Ce que le bouton ⋯ annonce à un lecteur d'écran : « Actions du bloc A ». */
  label: string;
  /** Des groupes, séparés d'un filet : déplacer, puis copier, puis retirer. */
  groups: readonly (readonly CmvMenuItem[])[];
  disabled?: boolean | undefined;
};

/**
 * Le menu ⋯ d'une carte (#719) : un bouton, et la liste des gestes qu'il ouvre.
 *
 * En `fixed` sous son bouton, aligné à sa droite : un menu en bout de carte déborderait de l'écran
 * vers la droite, et une grille qui défile le rognerait (`useAnchoredPosition`). Échap, un clic
 * ailleurs ou un geste choisi le referment ; les flèches passent d'un geste à l'autre.
 */
export function CmvMenu({ label, groups, disabled = false }: Readonly<CmvMenuProps>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(triggerRef, open, "end");
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    // Le premier geste ouvert prend le focus : le clavier enchaîne sans chercher le menu.
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // Le menu se ferme seul : Échap ne doit pas fermer aussi le panneau qui le porte.
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
    ];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    // Hors des gestes (un clic sur le fond du menu) : ↓ va au premier, ↑ au dernier.
    const from = current < 0 && step < 0 ? 0 : current;
    items[(from + step + items.length) % items.length]?.focus();
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="rounded-cmv-sm px-cmv-xs py-cmv-xs text-cmv-text-mid hover:bg-cmv-surface-hi hover:text-cmv-text-hi disabled:opacity-40"
      >
        <IoEllipsisHorizontal aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          style={position}
          onKeyDown={onKeyDown}
          className="fixed z-30 flex w-72 flex-col rounded-cmv-md border border-cmv-border bg-cmv-surface py-cmv-xs shadow-lg"
        >
          {groups.map((group, index) => (
            <div
              // Les groupes ne bougent pas pendant que le menu est ouvert : leur rang les nomme.
              key={index}
              className={cn(index > 0 && "mt-cmv-xs border-cmv-border border-t pt-cmv-xs")}
            >
              {/* Deux blocs au même libellé donnent deux « Déplacer vers » au même nom. */}
              {group.map((item, rank) => (
                <button
                  key={rank}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className="flex w-full flex-col items-start px-cmv-md py-cmv-xs text-left hover:bg-cmv-surface-hi focus:bg-cmv-surface-hi focus:outline-none disabled:opacity-40"
                >
                  <span
                    className={cn(
                      "text-cmv-body",
                      item.danger ? "text-cmv-error-on" : "text-cmv-text-hi",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.hint == null ? null : (
                    <span className="text-cmv-caption text-cmv-text-lo">{item.hint}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
