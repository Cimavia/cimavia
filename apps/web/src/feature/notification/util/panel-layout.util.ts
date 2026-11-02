import type { Size } from "@/shared/util/resize.util";

export type NotificationPanelMode = "popover" | "side";

/** Ce que ce navigateur retient du panneau de la cloche (#695). */
export type NotificationPanelLayout = {
  mode: NotificationPanelMode;
  /** `null` = jamais redimensionné : le panneau suit son contenu, jusqu'à sa hauteur d'origine. */
  popover: Size | null;
  /** `null` = jamais réglée : la largeur `md` du slide-over. */
  sideWidth: number | null;
};

export const DEFAULT_PANEL_LAYOUT: NotificationPanelLayout = {
  mode: "popover",
  popover: null,
  sideWidth: null,
};

function isLength(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function readSize(value: unknown): Size | null {
  if (typeof value !== "object" || value == null) return null;
  const { width, height } = value as Record<string, unknown>;
  return isLength(width) && isLength(height) ? { width, height } : null;
}

/**
 * Relit ce que le stockage garde, champ par champ : une largeur corrompue ne fait pas perdre le
 * mode choisi. Les tailles sont relues TELLES QUELLES — c'est au rendu qu'elles se ramènent à la
 * fenêtre, qui peut avoir changé depuis.
 */
export function parsePanelLayout(raw: string | null): NotificationPanelLayout {
  if (raw == null) return DEFAULT_PANEL_LAYOUT;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
  if (typeof stored !== "object" || stored == null) return DEFAULT_PANEL_LAYOUT;
  const { mode, popover, sideWidth } = stored as Record<string, unknown>;
  return {
    mode: mode === "side" ? "side" : "popover",
    popover: readSize(popover),
    sideWidth: isLength(sideWidth) ? sideWidth : null,
  };
}
