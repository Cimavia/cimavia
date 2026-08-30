import { isUpcomingIsoDate, type ScheduledSessionDto, ScheduledSessionStatus } from "@cmv/shared";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AthleteExerciseCard } from "@/feature/plan/component/AthleteExerciseCard";
import { AthleteSessionRail } from "@/feature/plan/component/AthleteSessionRail";
import { useLocalTracking } from "@/feature/plan/hook/useLocalTracking";
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

      {session == null ? null : <LoadedSession session={session} />}
    </CmvAppShell>
  );
}

/**
 * La séance CHARGÉE — et le suivi qui va avec.
 *
 * `useLocalTracking` part de ce que le serveur connaît : l'appeler pendant le chargement le
 * figerait sur un état vide, et une séance déjà débriefée rouverte sur un autre navigateur
 * n'afficherait plus aucune coche. Il vit donc là où la séance est garantie présente.
 */
function LoadedSession({ session }: Readonly<{ session: ScheduledSessionDto }>) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const remote = useMemo(
    () => Object.fromEntries(session.exercises.map((exercise) => [exercise.id, exercise.tracking])),
    [session],
  );
  const local = useLocalTracking(session.id, remote);

  /**
   * Une séance À VENIR n'affiche aucune case : le suivi s'ouvre le jour venu, et cocher une série
   * qu'on n'a pas encore faite n'aurait pas de sens. Une séance DÉBRIEFÉE les garde visibles mais
   * figées — le suivi reste consultable, il ne se modifie plus.
   */
  const frozen = session.status === ScheduledSessionStatus.DONE;
  const trackable = !isUpcomingIsoDate(session.scheduledDate);

  return (
    // Plus de `max-w` : la séance occupe la page, le rail a besoin de sa place et une grille
    // à quatre colonnes ne se lit pas dans une colonne étroite.
    <div className="flex flex-col gap-cmv-lg">
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

      {/* Le débrief vit dans le RAIL, collé en bas, et nulle part ailleurs : deux boutons pour
              la même action font hésiter sur ce qu'ils font de différent. C'est un écart avec le
              mobile, où il n'y a pas de rail et où l'action reste en tête d'écran. */}

      <div className="grid w-full gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_320px]">
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
              <AthleteExerciseCard
                exercise={exercise}
                position={index + 1}
                tracking={local.tracking[exercise.id] ?? null}
                trackable={trackable}
                frozen={frozen}
                onToggleUnit={(blockId, unitIndex) =>
                  local.toggleUnit(exercise.id, blockId, unitIndex)
                }
                onRounds={(blockId, rounds) => local.setRounds(exercise.id, blockId, rounds)}
              />
            </div>
          ))}
        </section>

        <AthleteSessionRail
          session={session}
          tracking={local.tracking}
          onOpenFeedback={() =>
            navigate({
              to: "/sessions/$sessionId/feedback",
              params: { sessionId: session.id },
            })
          }
        />
      </div>
    </div>
  );
}
