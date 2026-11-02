import { useCallback, useEffect, useState } from "react";
import {
  type NotificationPanelLayout,
  parsePanelLayout,
} from "@/feature/notification/util/panel-layout.util";
import { readStoredJson, writeStoredJson } from "@/shared/lib/local-storage";

const STORAGE_KEY = "cimavia-notification-panel";

// Rien de lisible : le panneau s'ouvre à sa taille d'origine, comme avant d'être réglable.
const read = () => parsePanelLayout(readStoredJson(STORAGE_KEY));

/**
 * Le mode et les tailles du panneau de la cloche, retenus par CE navigateur (#695).
 *
 * Absent de `resetAccountData`, délibérément : c'est une préférence du poste, pas une donnée du
 * compte — rien n'y nomme un tenant, et le compte suivant n'y apprend rien qu'une largeur.
 */
export function useNotificationPanelLayout() {
  const [layout, setLayout] = useState(read);

  // Écrit après le rendu. Les poignées ne rendent leur taille qu'à la FIN d'un geste : une écriture
  // par geste, pas par mouvement. Au montage, il réécrit ce qu'il vient de lire — `null` y reste
  // « jamais réglé », un défaut changé demain s'appliquera encore.
  useEffect(() => writeStoredJson(STORAGE_KEY, layout), [layout]);

  const update = useCallback((patch: Partial<NotificationPanelLayout>) => {
    setLayout((current) => ({ ...current, ...patch }));
  }, []);

  return { layout, update };
}
