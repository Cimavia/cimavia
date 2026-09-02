import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AthleteSheetPanel } from "@/feature/athlete/component/AthleteSheetPanel";
import { FeedbackInboxList, InboxFilter } from "@/feature/feedback/component/FeedbackInboxList";
import { FeedbackReadingPane } from "@/feature/feedback/component/FeedbackReadingPane";
import { useFeedbacks, useMarkFeedbackRead } from "@/feature/feedback/hook/useFeedbacks";
import { CmvAppShell, CmvEmptyState, CmvErrorState } from "@/shared/component";

// `getRouteApi` plutôt qu'un import de `Route` : l'écran est importé PAR la route, l'inverse
// fermerait le cycle. Le typage des search params est conservé.
const route = getRouteApi("/feedbacks");

/**
 * Les débriefs reçus, en BOÎTE DE RÉCEPTION (#121) : la liste à gauche, le débrief ouvert à
 * droite, tous deux visibles en même temps.
 *
 * C'était une liste de cartes qu'un tiroir recouvrait. Le motif de la maquette
 * (`coach_debrief.dc.html`) n'est pas un habillage : le coach traite ses débriefs à la suite, et
 * un tiroir l'obligeait à fermer pour retrouver où il en était.
 *
 * Cet écran-ci ne tient que les TROIS ÉTATS de la liste — chargement, panne, aucun débrief — qui
 * sont trois choses différentes : « aucun débrief » sur une panne réseau serait un mensonge. La
 * boîte elle-même est en dessous, et ne se monte qu'une fois qu'il y a quelque chose à trier.
 */
export function FeedbacksScreen() {
  const { t } = useTranslation();
  const { data: feedbacks, isPending, isError, refetch } = useFeedbacks();

  const hasFeedbacks = feedbacks != null && feedbacks.length > 0;

  return (
    <CmvAppShell title={t("feedback.inbox.title")} subtitle={t("feedback.inbox.subtitle")}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {!isPending && !isError && !hasFeedbacks ? (
        <CmvEmptyState
          title={t("feedback.empty.title")}
          description={t("feedback.empty.description")}
        />
      ) : null}

      {hasFeedbacks ? <FeedbackInbox feedbacks={feedbacks} /> : null}
    </CmvAppShell>
  );
}

/**
 * La boîte elle-même : ce qu'on trie, ce qu'on lit, et la fiche qu'on consulte au passage.
 *
 * Le débrief ouvert est porté par l'URL (`?feedback=<id>`, ou `?session=<id>` depuis la puce
 * « à propos de… »), pour que le tableau de suivi et la messagerie puissent y mener directement.
 * Conséquence : l'ouverture peut venir d'un clic OU d'une URL, donc le marquage « lu » ne peut pas
 * vivre dans le gestionnaire de clic — il vit dans l'effet ci-dessous, seul chemin pour les deux.
 *
 * Le SEGMENT, la RECHERCHE et la FICHE ouverte restent en état d'écran : ce ne sont pas des
 * destinations. Personne ne lie vers « les débriefs non lus de Cédric », alors qu'on lie vers UN
 * débrief — c'est ce qui décide, pas une préférence pour l'URL ou le `useState`. Corollaire voulu :
 * arriver par un lien ouvre toujours son débrief, même si un filtre le cacherait de la liste, parce
 * que le volet se résout sur la liste ENTIÈRE.
 */
function FeedbackInbox({ feedbacks }: Readonly<{ feedbacks: CoachFeedbackSummaryDto[] }>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const markRead = useMarkFeedbackRead();
  const [filter, setFilter] = useState<InboxFilter>(InboxFilter.ALL);
  const [search, setSearch] = useState("");
  // On garde l'ID et non l'objet : la liste se rafraîchit sous le panneau, et une copie figée y
  // afficherait un nom périmé.
  const [sheetAthleteId, setSheetAthleteId] = useState<string | null>(null);

  const { feedback: openedId, session: openedSessionId } = route.useSearch();
  // Deux entrées possibles : par le débrief (tableau de suivi, #113) ou par la SÉANCE débriefée
  // (puce « à propos de… », qui ne connaît pas l'id du débrief). Une séance jamais débriefée ne
  // résout rien : on reste sur la liste plutôt que d'ouvrir un volet vide.
  const opened =
    feedbacks.find((feedback) =>
      openedId != null ? feedback.id === openedId : feedback.scheduledSessionId === openedSessionId,
    ) ?? null;

  const openFeedback = (feedback: CoachFeedbackSummaryDto) =>
    navigate({ to: "/feedbacks", search: { feedback: feedback.id, session: undefined } });

  /**
   * Marquer à l'OUVERTURE, pas au survol ni au chargement de la liste : « lu » doit vouloir dire lu.
   * Idempotent côté API — rouvrir ne redate pas la lecture.
   *
   * Dépendances volontairement réduites à l'id et à l'état lu : `opened` est un objet reconstruit à
   * chaque rendu par le `find`, le mettre en dépendance relancerait l'effet en boucle.
   */
  const openedUnreadId = opened != null && opened.coachReadAt == null ? opened.id : null;
  useEffect(() => {
    if (openedUnreadId != null) markRead.mutate(openedUnreadId);
  }, [openedUnreadId, markRead.mutate]);

  // Le débrief porte déjà l'id ET le nom de son athlète : la fiche s'ouvre sans charger la liste
  // des athlètes, donc sans une requête de plus sur cet écran.
  const sheet = feedbacks.find((feedback) => feedback.athleteId === sheetAthleteId) ?? null;

  return (
    <>
      {/* Hauteur FIXE et non `min-h` : les deux colonnes défilent chacune dans son cadre, ce qui
          est tout l'intérêt du motif — la liste reste sous la main pendant qu'on lit un débrief
          long. Même cadre que la messagerie, qui a le même problème. */}
      <div className="flex h-[calc(100vh-11rem)] overflow-hidden rounded-cmv-lg border border-cmv-border bg-cmv-bg-1">
        <FeedbackInboxList
          feedbacks={feedbacks}
          openedId={opened?.id ?? null}
          filter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          onOpen={openFeedback}
        />

        {opened == null ? (
          <div className="flex flex-1 items-center justify-center p-cmv-lg">
            <CmvEmptyState title={t("feedback.inbox.pick")} />
          </div>
        ) : (
          // `key` sur le débrief : changer de ligne remonte un volet neuf plutôt que de recycler
          // l'état du précédent (défilement, requête de détail en vol).
          <FeedbackReadingPane
            key={opened.id}
            feedback={opened}
            onOpenSheet={() => setSheetAthleteId(opened.athleteId)}
          />
        )}
      </div>

      {sheet == null ? null : (
        <AthleteSheetPanel athlete={sheet} onClose={() => setSheetAthleteId(null)} />
      )}
    </>
  );
}
