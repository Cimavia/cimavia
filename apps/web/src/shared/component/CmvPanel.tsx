import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/shared/util/cn.util";

// md = formulaire simple (exercice) ; lg = mise en page à deux colonnes (builder de séance).
type CmvPanelSize = "md" | "lg";

const SIZE_CLASSES: Record<CmvPanelSize, string> = {
  md: "max-w-xl",
  lg: "max-w-5xl",
};

type CmvPanelProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  // Zone d'actions en pied de panneau (Annuler / Enregistrer).
  footer?: ReactNode;
  size?: CmvPanelSize;
};

/**
 * Les panneaux OUVERTS, du plus ancien au plus récent — pour qu'Échap ne ferme que celui du dessus.
 *
 * Deux panneaux peuvent se superposer : le panneau de détail d'une facture porte « Programmer un
 * rappel », qui ouvre le sien. Chacun posant son écouteur sur `window`, tous étaient appelés — et
 * annuler le rappel refermait aussi la facture qu'on lisait derrière. Un état de module plutôt
 * qu'un contexte : la pile décrit ce qui est à l'écran, pas ce qu'un arbre React contient, et deux
 * panneaux montés dans deux sous-arbres différents se superposent aussi bien.
 */
const openPanels: object[] = [];

// Panneau latéral (slide-over) — support des formulaires exercice / séance (cf. maquette).
export function CmvPanel({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}: Readonly<CmvPanelProps>) {
  /**
   * `onClose` est lu dans une ref plutôt que déclaré en dépendance : les appelants passent une
   * flèche en ligne, l'effet se relancerait donc à chaque rendu — et la pile serait redépilée puis
   * réempilée, plaçant sur le dessus un panneau que rien n'a rouvert. L'effet ne dépend ainsi que
   * de l'OUVERTURE, qui est exactement ce que la pile suit.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Échap ferme le panneau. Effet monté seulement quand le panneau est ouvert.
  useEffect(() => {
    if (!open) return;
    // Une identité propre à CETTE ouverture — deux panneaux se distinguent par leur objet.
    const self = {};
    openPanels.push(self);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openPanels.at(-1) === self) onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const index = openPanels.lastIndexOf(self);
      if (index !== -1) openPanels.splice(index, 1);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-cmv-bg-0/70"
      />
      <aside
        aria-label={title}
        className={cn(
          "relative flex h-full w-full flex-col border-cmv-border border-l bg-cmv-bg-1 shadow-xl",
          SIZE_CLASSES[size],
        )}
      >
        <header className="flex flex-col gap-cmv-xs border-cmv-border border-b p-cmv-xl">
          <h2 className="text-cmv-title text-cmv-text-hi">{title}</h2>
          {description == null ? null : (
            <p className="text-cmv-caption text-cmv-text-mid">{description}</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-cmv-xl">{children}</div>

        {footer == null ? null : (
          <footer className="flex justify-end gap-cmv-sm border-cmv-border border-t p-cmv-xl">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
