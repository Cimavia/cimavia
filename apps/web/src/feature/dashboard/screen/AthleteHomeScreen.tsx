import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/**
 * Ce que voit un athlète sur `/`, c'est-à-dire l'autre face de la route du tableau de bord : le web
 * est la surface du coach, l'athlète vit sur mobile.
 *
 * Extrait de `DashboardScreen` où il vivait en `return` anticipé — il n'a jamais été un état du
 * tableau de bord, mais l'écran d'un autre rôle sur la même route. Le `fallback` de `CmvRoleGate`
 * lui donne enfin sa place.
 *
 * Provisoire par construction : dès que les écrans athlète-sur-web existent (#25–#29), `/` doit
 * mener l'athlète à SON planning plutôt que lui souhaiter la bienvenue dans le vide.
 */
export function AthleteHomeScreen() {
  const { t } = useTranslation();
  const { data: authSession } = authClient.useSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-cmv-sm bg-cmv-bg-0 p-cmv-xl text-center">
      <h1 className="font-cmv-display text-cmv-title text-cmv-text-hi">
        {t("dashboard.welcome", { name: authSession?.user.name ?? "—" })}
      </h1>
      <p className="max-w-sm text-cmv-body text-cmv-text-mid">{t("dashboard.athleteHint")}</p>
      <CmvButton variant="secondary" onClick={() => authClient.signOut()}>
        {t("common.logout")}
      </CmvButton>
    </main>
  );
}
