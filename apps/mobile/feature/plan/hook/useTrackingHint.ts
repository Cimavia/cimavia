import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const KEY = "cimavia-tracking-hint-seen";

/**
 * L'amorçage du suivi : « Coche au fur et à mesure », **première séance seulement**.
 *
 * Il disparaît au premier tap et ne revient jamais — pas de visite guidée, pas de modale, pas de
 * série d'infobulles. Un indice qu'on doit fermer deux fois n'est plus un indice.
 *
 * Le drapeau vit en local et non côté serveur : c'est une préférence d'affichage sur CE téléphone,
 * pas une donnée de l'athlète.
 */
export function useTrackingHint() {
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((seen) => {
        if (!cancelled && seen == null) setHint(true);
      })
      // Stockage illisible : on n'affiche pas l'indice. Le montrer à tort à chaque ouverture
      // serait pire que ne jamais le montrer.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissHint = useCallback(() => {
    setHint(false);
    void AsyncStorage.setItem(KEY, "1");
  }, []);

  return { hint, dismissHint };
}
