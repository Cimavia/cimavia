import { mondayOfIsoWeek, PlanWeekType, todayIsoDate, unassignedDraftPlans } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CoachPlanSection } from "@/feature/plan/component/CoachPlanSection";
import { UnassignedDraftsSection } from "@/feature/plan/component/UnassignedDraftsSection";
import { DEFAULT_WEEK_COUNT } from "@/feature/plan/constant";
import { useCreatePlan, usePlans } from "@/feature/plan/hook/usePlans";
import { CmvAppShell, CmvButton, CmvEmptyState, CmvErrorState } from "@/shared/component";

// Liste des planifications du coach (p3-1, reprise en #225). Surface coach : l'API refuse déjà
// l'athlète en 403.
export function PlansScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: plans, isPending, isError, refetch } = usePlans();
  const createPlan = useCreatePlan();

  const hasPlans = plans != null && plans.length > 0;

  /**
   * Le lundi de la semaine courante, début par défaut du cycle. `null` est inatteignable
   * (`todayIsoDate` rend toujours une date lisible) mais ne se replie PAS sur une valeur inventée :
   * le bouton se ferme plutôt que d'ouvrir un cycle daté au hasard (règle 5).
   */
  const startDate = mondayOfIsoWeek(todayIsoDate());
  const canCreate = startDate != null && !createPlan.isPending;

  /**
   * « Nouvelle planification » n'ouvre plus de panneau : elle crée le brouillon et ouvre le
   * CONSTRUCTEUR (#207). Le coach n'avait à décider du titre, de la date et du destinataire
   * qu'une seule fois, avant d'avoir rien vu, dans un panneau qui ne revenait jamais. Tout cela
   * se saisit et se corrige maintenant en haut du constructeur.
   *
   * Le prix, assumé : des brouillons vides vont s'accumuler — un clic vaut une ligne en base.
   * Depuis #225 ils ne se perdent plus dans une grille : ils ont leur bac, en tête de l'écran. Le
   * recours reste ouvert tant que le cycle est brouillon (« Supprimer le cycle »).
   */
  function onNewPlan() {
    if (startDate == null) return;
    createPlan.mutate(
      {
        // Un cycle se construit avant de savoir pour qui (#144) — et le titre par défaut n'est pas
        // le repli silencieux qu'interdit la règle 5 : le champ est à l'écran, vide de sens et
        // immédiatement modifiable, la valeur ne prétend pas être une donnée.
        athleteId: null,
        title: t("plan.defaultTitle"),
        description: null,
        startDate,
        weeks: Array.from({ length: DEFAULT_WEEK_COUNT }, () => ({ type: PlanWeekType.TRAINING })),
      },
      {
        onSuccess: (plan) => navigate({ to: "/plans/$planId", params: { planId: plan.id } }),
      },
    );
  }

  // Le même geste aux deux endroits qui l'offrent, et donc le même libellé : deux boutons écrits
  // deux fois divergeraient au premier changement de mot.
  const newPlanButton = (
    <CmvButton onClick={onNewPlan} disabled={!canCreate}>
      {createPlan.isPending ? t("plan.creating") : t("plan.new")}
    </CmvButton>
  );

  return (
    <CmvAppShell title={t("plan.title")} subtitle={t("plan.subtitle")} actions={newPlanButton}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {/* Erreur, vide et chargement sont trois états distincts : « Aucune planification » sur une
          panne réseau serait un mensonge. Le vide de la RECHERCHE, lui, appartient à la section —
          seule à savoir ce que la barre d'outils demande. */}
      {!isPending && !isError && !hasPlans ? (
        <CmvEmptyState
          title={t("plan.empty.title")}
          description={t("plan.empty.description")}
          action={newPlanButton}
        />
      ) : null}

      {hasPlans ? (
        <div className="flex flex-col gap-cmv-lg">
          {/* Le bac AVANT le tableau : ces cycles n'ont pas de ligne d'athlète, et ce sont les
              seuls sur lesquels il reste une décision à prendre. */}
          <UnassignedDraftsSection drafts={unassignedDraftPlans(plans)} />
          <CoachPlanSection plans={plans} />
        </div>
      ) : null}
    </CmvAppShell>
  );
}
