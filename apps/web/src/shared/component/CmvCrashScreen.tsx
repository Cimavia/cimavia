import { translatedOr } from "@cmv/shared";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "./CmvButton";

type CmvCrashScreenProps = {
  error: unknown;
};

/**
 * Ce qui s'affiche quand une erreur NON MAÎTRISÉE démonte l'arbre React — à ne pas confondre avec
 * `CmvErrorState`, qui parle d'un chargement raté.
 *
 * La distinction n'est pas cosmétique : un chargement raté invite à réessayer la requête, et les
 * données de l'utilisateur sont intactes derrière. Ici, c'est le rendu lui-même qui vient de
 * tomber, et sans ce filet l'utilisateur voit du BLANC — l'écran qu'on ne signale pas, dont on
 * s'en va (#183).
 *
 * Le bouton RECHARGE la page, il n'appelle pas le `reset` du routeur. `reset` re-rend le même arbre
 * avec l'état qui vient de le faire tomber : dans le cas d'un crash de rendu il retombe aussitôt,
 * ce qui se lit comme un bouton qui ne fait rien. Un rechargement repart d'un état neuf, c'est-à-dire
 * de la seule action qui répare vraiment.
 */
export function CmvCrashScreen({ error }: Readonly<CmvCrashScreenProps>) {
  const { t } = useTranslation();

  /**
   * La remontée vit ICI et non dans le `defaultOnCatch` du routeur, qui serait pourtant le point
   * d'accroche idiomatique : ce rappel n'est câblé que sur la `CatchBoundary`. Une erreur levée en
   * `beforeLoad` met le match en statut `error` et rend l'écran de repli SANS passer par elle
   * (`Match.js`) — elle s'afficherait donc sans que personne ne l'entende. Un effet dans le
   * composant couvre les deux chemins, parce qu'il n'y en a qu'un pour arriver ici.
   */
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-cmv-md bg-cmv-bg-0 p-cmv-xl text-center">
      <h1 className="text-cmv-subtitle text-cmv-text-hi">
        {translatedOr(
          t("common.crash.title"),
          "common.crash.title",
          "L'application a rencontré un problème",
        )}
      </h1>
      <p className="max-w-sm text-cmv-caption text-cmv-text-mid">
        {translatedOr(
          t("common.crash.description"),
          "common.crash.description",
          "L'incident nous a été signalé. Recharge la page pour reprendre où tu en étais.",
        )}
      </p>
      <CmvButton onClick={() => window.location.reload()}>
        {translatedOr(t("common.crash.reload"), "common.crash.reload", "Recharger la page")}
      </CmvButton>
    </main>
  );
}
