import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CmvResizeHandle } from "@/shared/component/CmvResizeHandle";
import { useViewportSize } from "@/shared/hook/useViewportSize";
import { cn } from "@/shared/util/cn.util";
import { clamp } from "@/shared/util/resize.util";

// md = formulaire simple (exercice) ; lg = mise en page à deux colonnes (builder de séance).
type CmvPanelSize = "md" | "lg";

const SIZE_CLASSES: Record<CmvPanelSize, string> = {
  md: "max-w-xl",
  lg: "max-w-5xl",
};

/**
 * Les bornes d'une largeur réglable (#695) : au plus étroit, celle du panneau de la cloche ; au plus
 * large, la fenêtre moins une bande de fond — il faut encore pouvoir cliquer à côté pour fermer.
 */
const PANEL_MIN_WIDTH = 320;
const BACKDROP_STRIP = 48;
// Une poignée de bord n'a qu'une dimension : la hauteur passée est sans effet.
const NO_HEIGHT = 0;

type CmvPanelProps = {
  open: boolean;
  title: string;
  description?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  // Zone d'actions en pied de panneau (Annuler / Enregistrer).
  footer?: ReactNode;
  size?: CmvPanelSize;
  /**
   * Largeur réglable, en px (#695) : le bord gauche devient une poignée. Les deux vont ensemble ;
   * sans elles, `size` décide, comme avant. Ramenée à la fenêtre au rendu, sans être réécrite.
   */
  width?: number | undefined;
  onWidthChange?: ((width: number) => void) | undefined;
  /** Corps sans marge : pour une liste dont les lignes portent leur propre filet. */
  flush?: boolean | undefined;
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
  width,
  onWidthChange,
  flush = false,
}: Readonly<CmvPanelProps>) {
  const { t } = useTranslation();
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
      // Inscrit par CETTE ouverture et retiré une seule fois : l'index est toujours trouvé.
      openPanels.splice(openPanels.lastIndexOf(self), 1);
    };
  }, [open]);

  if (!open) return null;

  const resizable = width == null || onWidthChange == null ? null : { width, onWidthChange };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-cmv-bg-0/70"
      />
      <aside
        aria-label={title}
        className={cn(
          "relative flex h-full w-full flex-col border-cmv-border border-l bg-cmv-bg-1 shadow-xl",
          resizable == null && SIZE_CLASSES[size],
        )}
        // Bornée en CSS, aux mêmes bornes que la poignée : seul le panneau réglable lit la fenêtre.
        style={
          resizable == null
            ? undefined
            : {
                width: `min(${resizable.width}px, calc(100vw - ${BACKDROP_STRIP}px))`,
                minWidth: PANEL_MIN_WIDTH,
              }
        }
      >
        {resizable == null ? null : <PanelWidthHandle {...resizable} />}
        <header className="flex flex-col gap-cmv-xs border-cmv-border border-b p-cmv-xl">
          <h2 className="text-cmv-title text-cmv-text-hi">{title}</h2>
          {description == null ? null : (
            <p className="text-cmv-caption text-cmv-text-mid">{description}</p>
          )}
        </header>

        <div className={cn("flex-1 overflow-y-auto", !flush && "p-cmv-xl")}>{children}</div>

        {footer == null ? null : (
          <footer className="flex justify-end gap-cmv-sm border-cmv-border border-t p-cmv-xl">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

type PanelWidthHandleProps = {
  width: number;
  onWidthChange: (width: number) => void;
};

/**
 * La poignée du bord gauche, à part pour que SEUL un panneau réglable suive la fenêtre : la cloche
 * monte le sien en permanence, les autres usages n'ont pas à se re-rendre à chaque redimensionnement.
 */
function PanelWidthHandle({ width, onWidthChange }: Readonly<PanelWidthHandleProps>) {
  const viewport = useViewportSize();
  const maxWidth = viewport.width - BACKDROP_STRIP;

  return (
    <CmvResizeHandle
      axis="x"
      size={{ width: clamp(width, PANEL_MIN_WIDTH, maxWidth), height: NO_HEIGHT }}
      min={{ width: PANEL_MIN_WIDTH, height: NO_HEIGHT }}
      max={{ width: maxWidth, height: NO_HEIGHT }}
      onResize={(next) => onWidthChange(next.width)}
      className="-left-1 absolute inset-y-0 z-10"
    />
  );
}
