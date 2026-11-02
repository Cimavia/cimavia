import { useCallback, useEffect, useState } from "react";
import {
  type NotificationPanelLayout,
  parsePanelLayout,
} from "@/feature/notification/util/panel-layout.util";

const STORAGE_KEY = "cimavia-notification-panel";

function read(): NotificationPanelLayout {
  try {
    return parsePanelLayout(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Stockage indisponible (navigation privée, politique du navigateur) : le panneau s'ouvre à sa
    // taille d'origine, comme avant d'être réglable.
    return parsePanelLayout(null);
  }
}

function write(layout: NotificationPanelLayout) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Écriture refusée : le réglage vaut pour la page ouverte, seul le rechargement le perdra.
  }
}

/**
 * Le mode et les tailles du panneau de la cloche, retenus par CE navigateur (#695).
 *
 * Absent de `resetAccountData`, délibérément : c'est une préférence du poste, pas une donnée du
 * compte — rien n'y nomme un tenant, et le compte suivant n'y apprend rien qu'une largeur.
 */
export function useNotificationPanelLayout() {
  const [layout, setLayout] = useState(read);

  // Écrit après le rendu, une fois par état et non par geste : une poignée émet plusieurs tailles
  // entre deux rendus. Au montage, il réécrit ce qu'il vient de lire — `null` y reste « jamais
  // réglé », un défaut changé demain s'appliquera encore.
  useEffect(() => write(layout), [layout]);

  // Fusionné dans l'état COURANT, pour la même raison : deux tailles d'un même rendu s'enchaînent.
  const update = useCallback((patch: Partial<NotificationPanelLayout>) => {
    setLayout((current) => ({ ...current, ...patch }));
  }, []);

  return { layout, update };
}
