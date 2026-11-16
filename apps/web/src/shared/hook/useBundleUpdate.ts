import { createContext, useContext, useEffect, useState } from "react";
import { entryScriptIn, servedEntryScript } from "@/shared/lib/bundle-update";

/**
 * Entre deux retours sur l'onglet : un Coach qui garde l'app au premier plan toute une matinée
 * doit aussi finir par voir la nouvelle version. La relecture ne coûte qu'un `index.html`.
 */
export const BUNDLE_CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Un nouveau bundle est-il en ligne (#290) ? Vérifié au chargement, au retour sur l'onglet et
 * toutes les 10 min tant qu'il est visible — un onglet caché ne lit rien, son retour vérifiera.
 *
 * Au chargement parce qu'une page n'est pas toujours neuve quand elle monte : un onglet restauré
 * depuis le cache du navigateur s'affiche au premier plan, sans `visibilitychange`, avec le bundle
 * d'hier — le cas même que l'issue soupçonnait.
 *
 * Une fois vu, c'est acquis : la vérification s'arrête, le bundle de la page ne rajeunira pas
 * avant le rechargement. Une lecture qui échoue (`null`) ne dit rien et n'arrête rien.
 *
 * Monté UNE fois, dans la route racine : l'invite vit dans `CmvAppShell`, que chaque écran remonte
 * à la navigation — la détection y oublierait ce qu'elle a vu.
 */
export function useBundleUpdate(): boolean {
  const [isAvailable, setAvailable] = useState(false);

  useEffect(() => {
    if (isAvailable) return;
    const running = entryScriptIn(document);
    if (running === null) return;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const served = await servedEntryScript();
      if (served !== null && served !== running) setAvailable(true);
    };
    const runCheck = () => {
      void check();
    };

    runCheck();
    document.addEventListener("visibilitychange", runCheck);
    const timer = setInterval(runCheck, BUNDLE_CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", runCheck);
      clearInterval(timer);
    };
  }, [isAvailable]);

  return isAvailable;
}

/** Ce que la route racine a vu, pour l'invite. Hors de la racine — un test d'écran —, rien. */
export const BundleUpdateContext = createContext(false);

export function useIsBundleUpdateAvailable(): boolean {
  return useContext(BundleUpdateContext);
}
