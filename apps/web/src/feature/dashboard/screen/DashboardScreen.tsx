import {
  countOverdueInvoices,
  countPendingInvoices,
  countUnreadFeedbacks,
  Role,
  todayIsoDate,
} from "@cmv/shared";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { DashboardTile } from "@/feature/dashboard/component/DashboardTile";
import { useFeedbacks } from "@/feature/feedback/hook/useFeedbacks";
import { useInvoices } from "@/feature/invoice/hook/useInvoices";
import { useUnreadNotificationCount } from "@/feature/notification/hook/useNotifications";
import { usePlans } from "@/feature/plan/hook/usePlans";
import { useReminderSummary } from "@/feature/reminder/hook/useReminders";
import { CmvAppShell, CmvButton } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/**
 * Tableau de bord du coach (maquette pd-4, #52).
 *
 * Deux rangées, et le découpage n'est pas cosmétique : « À traiter » répond à *qu'est-ce qui est
 * sur mon bureau aujourd'hui*, « Vue d'ensemble » à *où j'en suis*. Ce sont deux questions
 * différentes, et sept tuiles alignées à poids égal n'auraient répondu ni à l'une ni à l'autre.
 *
 * Aucun compteur n'est calculé ici : les dérivations vivent dans `@cmv/shared`, testées. L'écran
 * choisit quoi montrer, pas quoi compter.
 */

/**
 * Deux types plutôt qu'un seul à champs optionnels : les rangées n'ont pas la même forme, et c'est
 * exactement ce qui les distingue. Une tuile « à traiter » a TOUJOURS une destination (une tuile
 * d'action qui n'ouvre rien est un cul-de-sac — le seul écart voulu avec la strip décorative de la
 * maquette) et TOUJOURS une couleur de signal ; une tuile de contexte n'a ni l'une ni l'autre.
 */
type TodoTile = {
  labelKey: string;
  count: number | null;
  hintKey: string;
  tone: "warning" | "error";
  to: "/feedbacks" | "/reminders" | "/invoices";
};

type OverviewTile = {
  labelKey: string;
  count: number | null;
  hintKey: string;
};

export function DashboardScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authSession, isPending } = authClient.useSession();
  const { data: athletes } = useAthletes();
  const { data: plans } = usePlans();
  const { data: feedbacks } = useFeedbacks();
  const { data: invoices } = useInvoices();
  const { data: reminderSummary } = useReminderSummary();
  // Même clé de cache que la cloche : la tuile ne déclenche aucune requête de plus.
  const { data: unreadNotifications } = useUnreadNotificationCount();

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  if (!authSession) {
    return <Navigate to="/login" />;
  }

  // Le web est la surface du coach ; l'athlète vit sur mobile (il garde un accès de dépannage,
  // qui sera construit avec les écrans athlète — hors périmètre de cette phase).
  if (authSession.user.role !== Role.COACH) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-cmv-sm bg-cmv-bg-0 p-cmv-xl text-center">
        <h1 className="font-cmv-display text-cmv-title text-cmv-text-hi">
          {t("dashboard.welcome", { name: authSession.user.name })}
        </h1>
        <p className="max-w-sm text-cmv-body text-cmv-text-mid">{t("dashboard.athleteHint")}</p>
        <CmvButton variant="secondary" onClick={() => authClient.signOut()}>
          {t("common.logout")}
        </CmvButton>
      </main>
    );
  }

  // `todayIsoDate()` et non un instant : `Invoice.dueDate` est une date CIVILE, la lire en heure
  // locale ferait basculer de jour aux abords de minuit.
  const today = todayIsoDate();

  const todoTiles: TodoTile[] = [
    {
      labelKey: "dashboard.tiles.feedback",
      count: countUnreadFeedbacks(feedbacks),
      hintKey: "dashboard.tiles.feedbackHint",
      tone: "warning",
      to: "/feedbacks",
    },
    {
      labelKey: "dashboard.tiles.remindersDue",
      // `dueCount` compte les rappels NON TRAITÉS, pas les non lus : dérouler la cloche ne vide
      // pas cette tuile (cf. `ReminderService.summary`).
      count: reminderSummary?.dueCount ?? null,
      hintKey: "dashboard.tiles.remindersDueHint",
      tone: "warning",
      to: "/reminders",
    },
    {
      labelKey: "dashboard.tiles.overdueInvoices",
      count: countOverdueInvoices(invoices, today),
      hintKey: "dashboard.tiles.overdueInvoicesHint",
      tone: "error",
      to: "/invoices",
    },
  ];

  const overviewTiles: OverviewTile[] = [
    {
      labelKey: "dashboard.tiles.athletes",
      count: athletes?.length ?? null,
      hintKey: "dashboard.tiles.athletesHint",
    },
    {
      labelKey: "dashboard.tiles.plans",
      count: plans?.length ?? null,
      hintKey: "dashboard.tiles.plansHint",
    },
    {
      labelKey: "dashboard.tiles.invoices",
      // EXCLUT les factures en retard : les deux tuiles partitionnent l'impayé, personne n'est
      // compté deux fois (cf. `countPendingInvoices`).
      count: countPendingInvoices(invoices, today),
      hintKey: "dashboard.tiles.invoicesHint",
    },
    {
      labelKey: "dashboard.tiles.notifications",
      /**
       * Le MÊME nombre que le badge de la cloche, volontairement — il recoupe donc « Rappels dus »,
       * qu'il inclut. Afficher ici un nombre voisin mais différent de celui affiché à 300 px
       * au-dessus serait plus déroutant que la redondance : la cloche est une union par
       * construction, cette tuile en est le panneau indicateur, et son indice le dit.
       */
      count: unreadNotifications ?? null,
      hintKey: "dashboard.tiles.notificationsHint",
    },
  ];

  return (
    <CmvAppShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.welcome", { name: authSession.user.name })}
    >
      <div className="flex flex-col gap-cmv-xl">
        <section className="flex flex-col gap-cmv-md">
          <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
            {t("dashboard.section.todo")}
          </h2>
          <div className="grid gap-cmv-md md:grid-cols-2 xl:grid-cols-3">
            {todoTiles.map((tile) => (
              <DashboardTile
                key={tile.labelKey}
                label={t(tile.labelKey)}
                count={tile.count}
                hint={t(tile.hintKey)}
                variant="action"
                tone={tile.tone}
                onClick={() => navigate({ to: tile.to })}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-cmv-md">
          <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
            {t("dashboard.section.overview")}
          </h2>
          <div className="grid gap-cmv-md md:grid-cols-2 xl:grid-cols-4">
            {overviewTiles.map((tile) => (
              <DashboardTile
                key={tile.labelKey}
                label={t(tile.labelKey)}
                count={tile.count}
                hint={t(tile.hintKey)}
              />
            ))}
          </div>
        </section>
      </div>
    </CmvAppShell>
  );
}
