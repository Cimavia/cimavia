import { useTranslation } from "react-i18next";
import { apiErrorMessage, isUnauthorizedError } from "@/shared/lib/api";

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
 */
export function CmvFormError({ error }: Readonly<CmvFormErrorProps>) {
  const { t } = useTranslation();
  if (error == null || isUnauthorizedError(error)) return null;
  return (
    <p className="text-cmv-caption text-cmv-error">{apiErrorMessage(error) ?? t("common.error")}</p>
  );
}
