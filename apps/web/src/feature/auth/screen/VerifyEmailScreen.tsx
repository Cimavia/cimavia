import { getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../component/AuthLayout";
import { AuthNotice } from "../component/AuthNotice";

const route = getRouteApi("/verify-email");

/**
 * Où ramène le lien de l'e-mail de vérification (#270), après que l'API a vérifié le jeton.
 *
 * L'écran ne vérifie rien lui-même : l'API l'a fait avant de rediriger, et ne lui laisse qu'un
 * `?error=` quand le lien n'a pas confirmé l'adresse. Pas de session ouverte non plus — le lien
 * s'ouvre souvent sur un autre appareil que celui de l'inscription —, d'où l'invitation à se
 * connecter, ici ou dans l'application.
 *
 * Expiré ou falsifié, un seul message : la suite est la même, se connecter renvoie un lien neuf.
 * Seul le compte sans mot de passe (une seconde inscription l'a effacé) mène ailleurs : en choisir
 * un, ce qui confirme l'adresse au passage.
 */
export function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { outcome } = route.useSearch();

  function notice() {
    if (outcome === "passwordRequired") {
      return (
        <AuthNotice alert to="/forgot-password" linkLabel={t("auth.verifyEmail.toForgotPassword")}>
          {t("auth.verifyEmail.passwordRequired")}
        </AuthNotice>
      );
    }
    const failed = outcome === "failed";
    return (
      <AuthNotice alert={failed} to="/login" linkLabel={t("auth.verifyEmail.toLogin")}>
        {failed ? t("auth.verifyEmail.invalid") : t("auth.verifyEmail.success")}
      </AuthNotice>
    );
  }

  return <AuthLayout title={t("auth.verifyEmail.title")}>{notice()}</AuthLayout>;
}
