import { ScheduledSessionStatus } from "@cmv/shared";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AthleteExerciseCard } from "@/feature/plan/component/AthleteExerciseCard";
import { AthleteSessionRail } from "@/feature/plan/component/AthleteSessionRail";
import { useMyScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { CmvAppShell, CmvBadge, CmvCard, CmvErrorState } from "@/shared/component";
import { formatDate } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.athlete.sessionStatus: ScheduledSessionStatus

// `getRouteApi` plutôt qu'un import de `Route` : l'écran est importé PAR la route, l'inverse
// fermerait le cycle.
const route = getRouteApi("/sessions/$sessionId/");

/**
 * Détail d'une séance, côté athlète (#25) : consignes du coach, déroulé, documents.
 *
 * Les documents sont des URLs signées à durée courte — ils exigent le réseau, contrairement au
 * déroulé (dette P3-3). Ils s'ouvrent dans un onglet, comme le justificatif de facture.
 *
 * Un écart de maquette RATTRAPÉ depuis #26 : le bouton « Débriefer la séance » est là, avec sa
 * destination. Il manquait tant que l'écran de débrief n'existait pas — un bouton qui renvoie à
 * l'accueil est le cul-de-sac que cette épic supprime.
 *
 * Deux écarts assumés avec la maquette `WEB · DÉTAIL DE SÉANCE` :
 *  - pas de durée (« 90 min ») : `ScheduledSession` n'en porte pas (dette P3-5, #94) ;
 *  - les consignes du coach apparaissent UNE fois. La maquette les montre deux fois, à gauche
 *    (« Consignes du coach ») et dans son rail droit (« Notes globales ») — le modèle n'a qu'un
 *    champ `notes`, et l'afficher deux fois laisserait croire à deux textes distincts.
 */
export function AthleteSessionScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = route.useParams();
  const { data: session, isPending, isError, refetch } = useMyScheduledSession(sessionId);

  /**
   * Un objet à étaler plutôt que des props à `undefined` : sous `exactOptionalPropertyTypes`,
   * « absente » et « présente à undefined » ne sont pas la même chose. Tant que la séance n'est pas
   * chargée, l'en-tête n'a ni date ni statut à annoncer — il n'en annonce donc aucun.
   */
  const headerProps =
    session == null
      ? {}
      : {
          subtitle: formatDate(session.scheduledDate),
          actions: <CmvBadge>{t(`plan.athlete.sessionStatus.${session.status}`)}</CmvBadge>,
        };

  return (
    <CmvAppShell title={session?.title ?? t("plan.athlete.sessionFallbackTitle")} {...headerProps}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {session == null ? null : (
        <div className="flex max-w-3xl flex-col gap-cmv-lg">
          {/* Destination FIXE et non un retour d'historique : on arrive ici depuis le planning, la
              liste des séances ou une notification, et `history.back()` sortirait de l'app dans le
              dernier cas. Le planning est le parent naturel d'une séance. */}
          <Link
            to="/planning"
            search={{ week: undefined }}
            className="text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi"
          >
            {t("plan.athlete.backToPlanning")}
          </Link>

          {/* Débriefer est l'action attendue de l'athlète sur sa séance : elle vient AVANT le
              déroulé, pas enterrée sous la liste des exercices (même choix que sur mobile). */}
          <div>
            <Link
              to="/sessions/$sessionId/feedback"
              params={{ sessionId: session.id }}
              className="inline-flex items-center rounded-cmv-md bg-cmv-accent px-cmv-lg py-cmv-sm text-cmv-body text-cmv-accent-fg transition-colors hover:bg-cmv-accent-hi"
            >
              {session.status === ScheduledSessionStatus.DONE
                ? t("feedback.openDone")
                : t("feedback.open")}
            </Link>
          </div>

          <div className="grid gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="flex min-w-0 flex-col gap-cmv-md">
              {/* L'en-tête ne compte RIEN : la progression vit dans le rail et nulle part
                  ailleurs, sinon deux compteurs finissent par se contredire. */}
              <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
                {t("plan.athlete.composition", { count: session.exercises.length })}
              </h2>

              {/* Une séance diffusée sans exercice est l'anomalie du COACH : on la constate sans
                  demander à l'athlète de la réparer. */}
              {session.exercises.length === 0 ? (
                <CmvCard>
                  <div className="flex flex-col gap-cmv-xs">
                    <h3 className="text-cmv-subtitle text-cmv-text-hi">
                      {t("plan.athlete.emptyTitle")}
                    </h3>
                    <p className="text-cmv-body text-cmv-text-mid">
                      {t("plan.athlete.emptyDescription")}
                    </p>
                  </div>
                </CmvCard>
              ) : null}

              {session.exercises.map((exercise, index) => (
                <div key={exercise.id} id={`exercise-${exercise.id}`}>
                  <AthleteExerciseCard exercise={exercise} position={index + 1} />
                </div>
              ))}
            </section>

            <AthleteSessionRail
              session={session}
              onOpenFeedback={() =>
                navigate({
                  to: "/sessions/$sessionId/feedback",
                  params: { sessionId: session.id },
                })
              }
            />
          </div>
        </div>
      )}
    </CmvAppShell>
  );
}
