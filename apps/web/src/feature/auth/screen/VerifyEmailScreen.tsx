import { getRouteApi, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../component/AuthLayout";

const route = getRouteApi("/verify-email");

const LINK_CLASS = "mt-4 block text-cmv-accent text-sm hover:text-cmv-accent-hi";

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

  if (outcome === "passwordRequired") {
    return (
      <AuthLayout title={t("auth.verifyEmail.title")}>
        <p role="alert" className="text-cmv-text-mid text-sm">
          {t("auth.verifyEmail.passwordRequired")}
        </p>
        <Link to="/forgot-password" className={LINK_CLASS}>
          {t("auth.verifyEmail.toForgotPassword")}
        </Link>
      </AuthLayout>
    );
  }

  const failed = outcome === "failed";
  return (
    <AuthLayout title={t("auth.verifyEmail.title")}>
      <p role={failed ? "alert" : "status"} className="text-cmv-text-mid text-sm">
        {failed ? t("auth.verifyEmail.invalid") : t("auth.verifyEmail.success")}
      </p>
      <Link to="/login" className={LINK_CLASS}>
        {t("auth.verifyEmail.toLogin")}
      </Link>
    </AuthLayout>
  );
}
