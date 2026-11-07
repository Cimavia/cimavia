import { getRouteApi, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../component/AuthLayout";

const route = getRouteApi("/verify-email");

/**
 * Où ramène le lien de l'e-mail de vérification (#270), après que l'API a vérifié le jeton.
 *
 * L'écran ne vérifie rien lui-même : l'API l'a fait avant de rediriger, et ne lui laisse qu'un
 * `?error=` quand le jeton n'a pas servi. Pas de session ouverte non plus — le lien s'ouvre souvent
 * sur un autre appareil que celui de l'inscription —, d'où l'invitation à se connecter, ici ou dans
 * l'application.
 *
 * Expiré ou falsifié, un seul message : la suite est la même, se connecter renvoie un lien neuf.
 */
export function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { failed } = route.useSearch();

  return (
    <AuthLayout title={t("auth.verifyEmail.title")}>
      <p role={failed ? "alert" : "status"} className="text-cmv-text-mid text-sm">
        {failed ? t("auth.verifyEmail.invalid") : t("auth.verifyEmail.success")}
      </p>
      <Link to="/login" className="mt-4 block text-cmv-accent text-sm hover:text-cmv-accent-hi">
        {t("auth.verifyEmail.toLogin")}
      </Link>
    </AuthLayout>
  );
}
