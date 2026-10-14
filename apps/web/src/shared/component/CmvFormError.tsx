import { useTranslation } from "react-i18next";
import { apiErrorMessage, isStaleWriteError, isUnauthorizedError } from "@/shared/lib/api";

type CmvFormErrorProps = {
  /** L'erreur de la mutation (`mutation.error`), `null` tant qu'elle n'a pas échoué. */
  error: unknown;
};

/**
 * L'échec d'un formulaire, écrit sous lui : le message de l'API quand elle en donne un — il dit
 * déjà quoi corriger —, le message générique sinon (panne réseau, 500 muet).
 *
 * Rien sur un 401 : la fenêtre de reconnexion en dit déjà la cause, et ce message resterait affiché
 * APRÈS la reconnexion, alors que le coach n'a plus qu'à réenregistrer (#336).
 *
 * Une version périmée (#604) n'a pas de message d'API à lire, seulement un code : un écran qui
 * offre de recharger la dit par `CmvStaleBanner` — les constructeurs, enregistrement ET suppression
 * (#606) ; un geste sans bandeau qui arrive ici la dit par ce message.
 */
export function CmvFormError({ error }: Readonly<CmvFormErrorProps>) {
  const { t } = useTranslation();
  if (error == null || isUnauthorizedError(error)) return null;
  const message = isStaleWriteError(error)
    ? t("common.staleWrite")
    : (apiErrorMessage(error) ?? t("common.error"));
  return <p className="text-cmv-caption text-cmv-error">{message}</p>;
}
