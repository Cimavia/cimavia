import { Link, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/feature/auth";
import { CmvFullPageLoading } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/**
 * La confirmation d'une suppression (#795). Publique : le compte n'existe plus, aucune session ne
 * peut l'ouvrir. Un compte connecté qui taperait cette adresse n'a rien de supprimé : il retourne
 * à l'accueil, sans lire la confirmation le temps que la session se résolve.
 */
export function AccountDeletedScreen() {
  const { t } = useTranslation();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <CmvFullPageLoading />;

  if (session) {
    return (
      <Navigate to="/" search={{ q: undefined, filter: undefined, athlete: undefined }} replace />
    );
  }

  return (
    <AuthLayout title={t("account.deleted.title")}>
      <output className="block text-cmv-text-mid text-sm">{t("account.deleted.message")}</output>
      <Link to="/login" className="mt-4 block text-cmv-accent text-sm hover:text-cmv-accent-hi">
        {t("account.deleted.toLogin")}
      </Link>
    </AuthLayout>
  );
}
