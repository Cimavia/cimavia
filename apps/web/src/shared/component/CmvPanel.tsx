import { type ReactNode, useEffect } from "react";
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
  // Échap ferme le panneau. Effet monté seulement quand le panneau est ouvert.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
