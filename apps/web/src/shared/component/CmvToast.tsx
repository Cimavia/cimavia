import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/shared/util/cn.util";

// Nature du message : elle porte l'information AVANT le texte (couleur + pastille).
type ToastTone = "success" | "error" | "warning" | "info";

type Toast = { id: string; message: string; tone: ToastTone };

type ToastContextValue = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  // Fait remarquer ce que l'app a décidé à la place de l'utilisateur (ex. date recalée au lundi).
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Assez long pour être lu sans être une gêne. Les erreurs restent plus longtemps : elles
// demandent une action, et disparaître trop vite reviendrait à les cacher.
const TOAST_TTL_MS = 5000;
const ERROR_TOAST_TTL_MS = 8000;

// Barre latérale + pastille colorées : la couleur seule ne suffit pas (daltonisme), la
// position et le texte restent les porteurs principaux — la couleur ne fait que confirmer.
const TONE_CLASSES: Record<ToastTone, { bar: string; dot: string }> = {
  success: { bar: "bg-cmv-success", dot: "bg-cmv-success" },
  error: { bar: "bg-cmv-error", dot: "bg-cmv-error" },
  warning: { bar: "bg-cmv-warning", dot: "bg-cmv-warning" },
  info: { bar: "bg-cmv-accent", dot: "bg-cmv-accent" },
};

/**
 * File de notifications éphémères, en HAUT À DROITE (là où l'utilisateur les attend).
 * Montée une fois à la racine : n'importe quel écran obtient `useToast()` sans porter d'état ni
 * de markup — une mutation confirme donc son effet là où elle se produit.
 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? ERROR_TOAST_TTL_MS : TOAST_TTL_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => push(message, "success"),
      error: (message: string) => push(message, "error"),
      warning: (message: string) => push(message, "warning"),
      info: (message: string) => push(message, "info"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        z au-dessus du panneau latéral (z-50) : un toast déclenché depuis un formulaire en
        panneau doit rester lisible. `aria-live` annonce le message sans déplacer le focus.
      */}
      <output
        aria-live="polite"
        className="pointer-events-none fixed top-0 right-0 z-[60] flex w-full max-w-sm flex-col gap-cmv-sm p-cmv-lg"
      >
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className="pointer-events-auto flex w-full items-start gap-cmv-sm overflow-hidden rounded-cmv-md border border-cmv-border-hi bg-cmv-surface-hi pr-cmv-md text-left shadow-2xl"
          >
            {/* Barre de couleur pleine hauteur — repère visuel immédiat de la nature du message. */}
            <span className={cn("w-1 self-stretch", TONE_CLASSES[toast.tone].bar)} />

            <span className="flex flex-1 items-start gap-cmv-sm py-cmv-md">
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-cmv-pill",
                  TONE_CLASSES[toast.tone].dot,
                )}
              />
              <span className="text-cmv-body text-cmv-text-hi">{toast.message}</span>
            </span>
          </button>
        ))}
      </output>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context == null) {
    throw new Error("[toast] useToast() hors ToastProvider");
  }
  return context;
}
