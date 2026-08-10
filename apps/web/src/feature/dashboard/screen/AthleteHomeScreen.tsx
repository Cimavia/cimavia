import { useTranslation } from "react-i18next";
import { CmvAppShell, CmvEmptyState } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/**
 * Ce que voit un athlète sur `/`, c'est-à-dire l'autre face de la route du tableau de bord : le web
 * est la surface du coach, l'athlète vit sur mobile.
 *
 * Extrait de `DashboardScreen` où il vivait en `return` anticipé — il n'a jamais été un état du
 * tableau de bord, mais l'écran d'un autre rôle sur la même route.
 *
 * Il passe par `CmvAppShell` et ce n'est pas cosmétique : c'est la SIDEBAR qui compte. Sans elle,
 * les écrans athlète-sur-web existent sans qu'aucun athlète ne puisse y arriver autrement qu'en
 * tapant une URL. Chaque écran livré (#25–#29) y ajoutera son entrée ; la page, elle, ne fait que
 * dire pourquoi il n'y en a pas encore beaucoup.
 *
 * Provisoire par construction : le jour où le planning existe (#25), `/` doit mener l'athlète à SON
 * planning plutôt que lui expliquer qu'il n'y en a pas.
 */
export function AthleteHomeScreen() {
  const { t } = useTranslation();
  const { data: authSession } = authClient.useSession();

  return (
    <CmvAppShell
      title={t("dashboard.welcome", { name: authSession?.user.name ?? "—" })}
      subtitle={t("dashboard.athlete.subtitle")}
    >
      <CmvEmptyState
        title={t("dashboard.athlete.emptyTitle")}
        description={t("dashboard.athlete.emptyDescription")}
      />
    </CmvAppShell>
  );
}
