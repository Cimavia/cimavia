import {
  canWrite,
  isOwner,
  isSelfCoached,
  type MyAccess,
  type PlanDto,
  PlanStatus,
  type PlanSummaryDto,
  type PlanWeekDto,
  PlanWeekType,
  planAudience,
  ReminderEntityType,
  required,
  type ScheduledSessionDto,
  type ScheduledSessionSummaryDto,
  todayIsoDate,
} from "@cmv/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlanBillingSection } from "@/feature/invoice";
import { usePlanBilling } from "@/feature/invoice/hook/useInvoices";
import { myRightText } from "@/feature/library/util/access-text.util";
import { planKeys } from "@/feature/plan/api";
import { PlanAccessButton } from "@/feature/plan/component/PlanAccessButton";
import { PlanBuilderActions } from "@/feature/plan/component/PlanBuilderActions";
import { PlanHeaderForm } from "@/feature/plan/component/PlanHeaderForm";
import { PlanStatusLine } from "@/feature/plan/component/PlanStatusLine";
import { PlanWeekList } from "@/feature/plan/component/PlanWeekList";
import { ScheduledSessionPanel } from "@/feature/plan/component/ScheduledSessionPanel";
import {
  planDetailQuery,
  scheduledSessionDetailQuery,
  usePlan,
  usePlanMutations,
} from "@/feature/plan/hook/usePlan";
import { usePlanClipboard } from "@/feature/plan/hook/usePlanClipboard";
import { usePlans } from "@/feature/plan/hook/usePlans";
import { ScheduleReminderButton } from "@/feature/reminder";
import {
  CmvAppShell,
  CmvButton,
  CmvEmptyState,
  CmvErrorState,
  CmvLeaveDialog,
  CmvReadOnlyBanner,
} from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { type SaveBeforeLeaving, useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { useStaleReload } from "@/shared/hook/useStaleReload";
import { ApiError, isStaleWriteError } from "@/shared/lib/api";

// Séance en cours d'édition : le jour visé + l'instance (null = création sur ce jour). Pas de
// semaine : le jour la désigne, et le panneau peut l'envoyer dans une autre (#689).
type SessionEdit = { date: string; sessionId: string | null };

/**
 * Les cycles à comparer : ceux du coach, MOINS la copie que sa liste porte de celui qu'on regarde,
 * PLUS celui qu'on regarde. La liste peut être périmée d'une diffusion ou d'un changement de date
 * qu'on vient de faire ici, et `planAudience` doit répondre sur l'état affiché, pas sur un cache.
 */
function siblingsOf(plan: PlanDto, coachPlans: readonly PlanSummaryDto[]): PlanSummaryDto[] {
  return [plan, ...coachPlans.filter((item) => item.id !== plan.id)];
}

/**
 * Un cycle dont des termes DRAFT peuvent exister : un brouillon, adressé à quelqu'un, et pas à
 * soi (#14, #144). Diffusé, la facture est passée PENDING dans la transaction du `publish` — il
 * n'y a plus de brouillon à lire.
 *
 * L'API ne REFUSE plus cette lecture (#211), elle rend `null` dans les trois cas. Ce n'est donc
 * plus un garde-fou contre une erreur, mais le refus de poser une question dont on connaît déjà
 * la réponse. Et c'est le SEUL endroit où elle se pose : la section de facturation reçoit ce
 * qu'on lit ici, plutôt que de le redemander sous une garde qui devrait s'accorder avec celle-ci
 * — deux gardes sur une même clé de requête sont ce qui a produit le défaut.
 */
function isBillable(plan: PlanDto | undefined): boolean {
  return (
    plan != null &&
    plan.status !== PlanStatus.PUBLISHED &&
    plan.athleteId != null &&
    !isSelfCoached(plan)
  );
}

/**
 * Le destinataire tel qu'il s'écrit, ou `null` tant qu'il reste à choisir (#144). Sorti du
 * composant, qui frôle le seuil de complexité de la porte qualité — et parce que « pas encore
 * choisi » est une réponse à afficher, pas un cas d'erreur à replier sur un tiret : le titre le dit
 * (`plan.unassigned`), le panneau de séance aussi, chacun à sa façon (#518).
 */
function athleteNameOf(
  plan: { athleteId: string | null; athleteName: string | null },
  athleteLabel: (athleteId: string, athleteName: string) => string,
): string | null {
  return plan.athleteId == null || plan.athleteName == null
    ? null
    : athleteLabel(plan.athleteId, plan.athleteName);
}

/** Le destinataire dans le titre du cycle : son nom, ou le fait qu'il reste à choisir. */
function athleteHeading(
  plan: { athleteId: string | null; athleteName: string | null },
  athleteLabel: (athleteId: string, athleteName: string) => string,
  unassignedLabel: string,
): string {
  return athleteNameOf(plan, athleteLabel) ?? unassignedLabel;
}

/**
 * Une saisie de l'écran, par l'enregistrement que son formulaire remonte — `null` sans rien en
 * attente. `report` est stable : c'est ce que les formulaires exigent de `onUnsavedChange`.
 */
function useUnsavedInput() {
  const [save, setSave] = useState<SaveBeforeLeaving | null>(null);
  // `() => next` : passée telle quelle, React prendrait la fonction pour une mise à jour d'état.
  const report = useCallback((next: SaveBeforeLeaving | null) => setSave(() => next), []);
  return { save, report };
}

/**
 * Ce que l'en-tête, la facturation et le panneau de séance montrent sans l'avoir enregistré. La
 * diffusion part avec l'état ENREGISTRÉ du cycle : elle reste fermée tant que l'en-tête ou la
 * facturation attend (#326) — pas pour le panneau, la séance s'enregistre à part du cycle. Les
 * formulaires gardent leur saisie, ils ne remontent que de quoi l'enregistrer.
 *
 * Les trois retiennent la sortie — lien, retour arrière, F5 (#327, #518) —, et « Enregistrer »
 * les envoie tous (#682). L'un APRÈS l'autre, le panneau d'abord : déplacer le début du cycle
 * décale ses séances, et la saisie du panneau, qui cite la version d'avant, se ferait refuser
 * comme si un autre Coach l'avait changée. Un refus retient la sortie ; ce qui est parti le reste.
 * La suppression du cycle, elle, part sans demander : `guard.release`.
 */
function useUnsavedInputs() {
  const header = useUnsavedInput();
  const billing = useUnsavedInput();
  const panel = useUnsavedInput();
  const pending = [panel.save, billing.save, header.save].filter((save) => save != null);
  const guard = useLeaveGuard(pending.length > 0, async () => {
    let saved = true;
    for (const save of pending) {
      // Volontairement en série : voir plus haut. Chacun s'enregistre même après un refus.
      saved = (await save()) && saved;
    }
    return saved;
  });
  return {
    isHeaderUnsaved: header.save != null,
    reportHeader: header.report,
    isBillingUnsaved: billing.save != null,
    reportBilling: billing.report,
    reportPanel: panel.report,
    guard,
  };
}

/**
 * « Composer cette séance », depuis une colonne de Dosage (#721) : le cycle s'ouvre sur le panneau
 * de cette séance. Le paramètre se retire une fois lu — un retour arrière ne rouvre rien. Une
 * séance absente du cycle en cache attend sa relecture : elle a pu y être posée depuis ; relue et
 * toujours absente, elle n'ouvre rien.
 */
function useRequestedSession(
  plan: PlanDto | undefined,
  isFetching: boolean,
  open: (edit: SessionEdit) => void,
): void {
  const { session: requested } = useSearch({ from: "/plans/$planId" });
  const navigate = useNavigate();
  useEffect(() => {
    if (requested == null || plan == null) return;
    const summary = plan.weeks
      .flatMap((week) => week.sessions)
      .find((session) => session.id === requested);
    if (summary == null && isFetching) return;
    if (summary != null) open({ date: summary.scheduledDate, sessionId: summary.id });
    void navigate({ to: "/plans/$planId", params: { planId: plan.id }, search: {}, replace: true });
  }, [requested, plan, isFetching, open, navigate]);
}

export function PlanBuilderScreen() {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const { planId } = useParams({ from: "/plans/$planId" });
  const navigate = useNavigate();

  const { data: plan, isPending, isFetching, error, refetch } = usePlan(planId);
  /**
   * Les autres cycles du coach, pour dire ce que l'athlète voit de CELUI-CI (#172). La liste est
   * déjà en cache dès qu'on arrive depuis `/plans` ; ailleurs elle coûte une requête, et c'est le
   * prix de ne plus affirmer « l'athlète voit ce cycle » sans l'avoir vérifié.
   */
  const { data: coachPlans } = usePlans();
  const { addWeek, saveHeader, isBusy } = usePlanMutations(planId);
  // « Recharger » après un conflit sur l'en-tête (#604) : la génération remonte le formulaire sur
  // la version relue, et le refus qui ouvrait le bandeau s'oublie avec lui.
  const headerReload = useStaleReload(planId, planDetailQuery);
  const { clipboard, clearClipboard } = usePlanClipboard();
  // Gating de la diffusion : une facturation (DRAFT) doit avoir été saisie. `null` = pas encore.
  // Lue UNE fois ici, puis descendue à la section — cf. `isBillable`.
  const { data: billing } = usePlanBilling(planId, isBillable(plan));

  const [edit, setEdit] = useState<SessionEdit | null>(null);
  const { isHeaderUnsaved, reportHeader, isBillingUnsaved, reportBilling, reportPanel, guard } =
    useUnsavedInputs();
  useRequestedSession(plan, isFetching, setEdit);

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  // Sur la DONNÉE, pas sur l'échec : une relecture ratée — « Recharger », un retour d'onglet —
  // échoue alors que le cycle est en cache, et l'écran d'erreur effacerait la saisie en cours
  // (#604). Sauf s'il n'existe plus : supprimé par un autre Coach, il n'y a rien à garder.
  if (plan == null || isNotFound(error)) {
    return <PlanUnreadable error={error} onRetry={() => refetch()} />;
  }

  const isPublished = plan.status === PlanStatus.PUBLISHED;
  const hasAthlete = plan.athleteId != null;
  // `null` tant que la liste n'a pas répondu : la ligne de statut se tait plutôt que d'affirmer.
  const audience =
    coachPlans == null ? null : planAudience(plan, siblingsOf(plan, coachPlans), todayIsoDate());
  const titlesById = new Map((coachPlans ?? []).map((item) => [item.id, item.title]));
  const athleteTitle = athleteHeading(plan, athleteLabel, t("plan.unassigned"));
  // Ce que le Coach peut du cycle (#607) : le sien, ou celui d'un autre, ouvert en Lecture ou en
  // Écriture. Supprimer, gérer les accès, réaffecter et programmer un rappel restent au propriétaire.
  const access = required(plan.myAccess, "droit du coach sur son cycle");
  const isMine = isOwner(access);
  const readOnly = !canWrite(access);

  function onOpenCreate(date: string) {
    setEdit({ date, sessionId: null });
  }

  function onOpenEdit(session: ScheduledSessionSummaryDto) {
    setEdit({ date: session.scheduledDate, sessionId: session.id });
  }

  return (
    <CmvAppShell
      // Le destinataire DANS le titre : devant une liste de cycles qui se ressemblent, savoir à
      // qui celui-ci s'adresse compte autant que son nom.
      title={t("plan.builder.titleWithAthlete", {
        title: plan.title,
        name: athleteTitle,
      })}
      // La date a quitté le sous-titre : elle est devenue un champ du formulaire d'en-tête, et
      // l'afficher aussi ici la donnerait à lire dans deux formats à deux endroits (#207).
      subtitle={t("plan.card.counts", {
        weeks: plan.weekCount,
        sessions: plan.sessionCount,
      })}
      actions={
        // En Lecture, le cycle se consulte et se quitte : rien d'autre ne s'y fait (#607).
        readOnly ? (
          <CmvButton
            onClick={() =>
              navigate({
                to: "/plans",
                search: { q: undefined, state: undefined, athlete: undefined },
              })
            }
          >
            {t("common.close")}
          </CmvButton>
        ) : (
          <>
            {isMine ? (
              <OwnerTools plan={plan} athleteName={athleteNameOf(plan, athleteLabel)} />
            ) : null}
            <PlanBuilderActions
              planId={planId}
              version={plan.updatedAt}
              isPublished={isPublished}
              canDelete={isMine}
              hasWeeks={plan.weeks.length > 0}
              hasAthlete={hasAthlete}
              isBillingFilled={billing != null}
              requiresBilling={!isSelfCoached(plan)}
              isHeaderUnsaved={isHeaderUnsaved}
              isBillingUnsaved={isBillingUnsaved}
              isBusy={isBusy}
              onDeleted={guard.release}
            />
          </>
        )
      }
    >
      <div className="mb-cmv-lg flex flex-col gap-cmv-sm">
        <Link
          to="/plans"
          search={{ q: undefined, state: undefined, athlete: undefined }}
          className="text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi"
        >
          {t("plan.builder.back")}
        </Link>

        <PlanStatusLine
          status={plan.status}
          hasAthlete={hasAthlete}
          isBillingFilled={billing != null}
          requiresBilling={!isSelfCoached(plan)}
          audience={audience}
          titlesById={titlesById}
        />

        <SharedPlanBanner access={access} owner={plan.coachName} />

        {/* Le presse-papier survit à la navigation (c'est ce qui rend le collage inter-cycle
            possible) : sans ce bandeau, des boutons « Coller ici » apparaîtraient sur un cycle
            sans que rien ne dise ce qui est armé, ni d'où il vient. */}
        {clipboard == null ? null : (
          <div className="flex flex-wrap items-center gap-cmv-sm rounded-cmv-md border border-cmv-success-line bg-cmv-success-soft px-cmv-md py-cmv-sm">
            <span className="text-cmv-caption text-cmv-success-on">
              {t("plan.clipboard.banner", {
                number: clipboard.weekNumber,
                plan: clipboard.planTitle,
              })}
            </span>
            <CmvButton variant="ghost" onClick={clearClipboard}>
              {t("plan.clipboard.clear")}
            </CmvButton>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-cmv-lg">
        {/* Ce qui définit le cycle, AU-DESSUS des semaines : titre, destinataire, début et
            description ne se saisissaient qu'une fois, dans un panneau qui ne revenait jamais
            (#207). C'est aussi l'emplacement que la maquette réservait à sa bande « plan meta ».
            Clé sur le statut : la diffusion remonte le formulaire, qui repart des valeurs
            ENREGISTRÉES — ses champs grisés ne doivent pas garder une saisie qui n'est pas partie
            (#326). Clé sur la relecture aussi : « Recharger » le remonte sur la dernière version
            (#604). */}
        <PlanHeaderForm
          key={`${plan.status}:${headerReload.generation}`}
          plan={plan}
          hasInvoiceDocument={billing?.documentFileName != null}
          readOnly={readOnly}
          canReassign={isMine}
          isSaving={saveHeader.isPending}
          onSave={saveHeader.mutateAsync}
          isStale={isStaleWriteError(saveHeader.error)}
          isReloading={headerReload.isReloading}
          onReload={() => headerReload.reload(planId, saveHeader.reset)}
          onUnsavedChange={reportHeader}
        />

        {plan.weeks.length === 0 ? (
          <CmvEmptyState
            title={t("plan.builder.emptyWeeks")}
            description={t("plan.builder.emptyWeeksHint")}
          />
        ) : null}

        <PlanWeekList
          planId={planId}
          planTitle={plan.title}
          isPublished={isPublished}
          readOnly={readOnly}
          weeks={plan.weeks}
          onAddSession={onOpenCreate}
          onEditSession={onOpenEdit}
        />

        {readOnly ? null : (
          <div>
            <CmvButton
              variant="secondary"
              disabled={isBusy}
              onClick={() => addWeek.mutate({ type: PlanWeekType.TRAINING })}
            >
              {t("plan.builder.addWeek")}
            </CmvButton>
          </div>
        )}

        {/* Facturation du cycle : sa saisie conditionne la diffusion (gating) — SAUF en
            auto-coaching, où l'on ne se facture pas soi-même. L'API lève alors le gating et
            refuse la saisie (#14) : laisser la section visible proposerait un formulaire
            obligatoire que rien n'accepterait. */}
        {!isSelfCoached(plan) && (
          <PlanBillingSection
            planId={planId}
            isPublished={isPublished}
            hasAthlete={hasAthlete}
            billing={billing}
            readOnly={readOnly}
            onUnsavedChange={reportBilling}
          />
        )}
      </div>

      {edit == null ? null : (
        <SessionPanelHost
          edit={edit}
          planStartDate={plan.startDate}
          weeks={plan.weeks}
          planId={planId}
          isPublished={isPublished}
          readOnly={readOnly}
          athleteName={athleteNameOf(plan, athleteLabel)}
          onClose={() => setEdit(null)}
          onUnsavedChange={reportPanel}
          onOpenDosage={(sessionId) =>
            void navigate({ to: "/plans/$planId/dosage/$sessionId", params: { planId, sessionId } })
          }
        />
      )}
      <CmvLeaveDialog {...guard.dialog} />
    </CmvAppShell>
  );
}

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

/**
 * Ce qui reste au propriétaire dans la barre du builder : ouvrir le cycle à ses entreprises
 * (#607), et le rappel contextuel (#45) — posé ici plutôt que dans PlanBuilderActions, qui ne
 * porte que les actions destructrices et leur gating. Un rappel se programme à tout moment,
 * brouillon comme cycle diffusé ; il ne vise que ce qui est à soi.
 */
function OwnerTools({
  plan,
  athleteName,
}: Readonly<{ plan: PlanDto; athleteName: string | null }>) {
  return (
    <>
      <PlanAccessButton plan={plan} athleteName={athleteName} />
      <ScheduleReminderButton
        entityType={ReminderEntityType.PLAN}
        entityId={plan.id}
        targetLabel={plan.title}
        variant="ghost"
      />
    </>
  );
}

/**
 * Ce que l'écran dit du cycle d'un autre Coach (#607) : en Lecture, qu'il se consulte seulement ;
 * en Écriture, ce qui reste à son propriétaire. Rien sur le sien.
 */
function SharedPlanBanner({ access, owner }: Readonly<{ access: MyAccess; owner: string }>) {
  const { t } = useTranslation();
  if (isOwner(access)) return null;
  const right = myRightText(access, t);
  return (
    <CmvReadOnlyBanner
      message={t(canWrite(access) ? "plan.builder.sharedWrite" : "plan.builder.readOnly", {
        owner,
        right,
      })}
    />
  );
}

type SessionPanelHostProps = {
  edit: SessionEdit;
  // Le cycle tel qu'il se montre À L'INSTANT : un autre Coach a pu le décaler.
  planStartDate: string;
  weeks: readonly PlanWeekDto[];
  planId: string;
  isPublished: boolean;
  readOnly: boolean;
  athleteName: string | null;
  onClose: () => void;
  onUnsavedChange: (save: SaveBeforeLeaving | null) => void;
  onOpenDosage: (sessionId: string) => void;
};

/**
 * Le panneau de séance, ouvert sur ce que l'écran a cliqué. En édition, il attend l'instance
 * complète : le résumé de la vue semaine ne porte pas la composition.
 *
 * Elle est RELUE à chaque ouverture, même en cache (#604) : nos propres gestes — un glisser, un
 * recollage de journée — ont pu faire avancer la séance, et la saisie citerait la version d'avant,
 * refusée comme si un autre Coach l'avait changée. « Recharger », après un vrai conflit, relit la
 * séance et le cycle, et remonte le panneau sur la version relue.
 */
function SessionPanelHost({ edit, weeks, ...props }: Readonly<SessionPanelHostProps>) {
  const queryClient = useQueryClient();
  const { onError } = useMutationToast();
  const { onClose, planId } = props;
  const isEditing = edit.sessionId != null;
  const {
    data: session,
    error,
    isFetchedAfterMount,
  } = useQuery<ScheduledSessionDto>({
    ...scheduledSessionDetailQuery(edit.sessionId ?? ""),
    // La requête ne part jamais sans l'id.
    enabled: isEditing,
    refetchOnMount: "always",
  });
  const { generation, reload, isReloading } = useStaleReload(
    undefined,
    scheduledSessionDetailQuery,
  );
  // Relue, et toujours rien : retirée entre-temps par un autre Coach. Le panneau ne s'ouvre pas,
  // et le dit — sans quoi le clic semblerait ne rien faire.
  const isGone = isEditing && isFetchedAfterMount && session == null;

  useEffect(() => {
    if (!isGone) return;
    onError(error);
    onClose();
  }, [isGone, error, onError, onClose]);

  if (isEditing && (!isFetchedAfterMount || session == null)) return null;

  return (
    <ScheduledSessionPanel
      key={generation}
      {...props}
      weeks={weeks}
      date={edit.date}
      session={session ?? null}
      onReload={() =>
        reload(required(edit.sessionId, "rechargement hors édition"), () =>
          queryClient.invalidateQueries({ queryKey: planKeys.detail(planId) }),
        )
      }
      isReloading={isReloading}
    />
  );
}

/**
 * Le cycle n'a pas pu être lu. Une panne se DIT, avec un recours : rediriger vers la liste
 * laisserait croire que le cycle a disparu. Sans échec, ou sur un 404, il n'existe pas, ou plus.
 */
function PlanUnreadable({ error, onRetry }: Readonly<{ error: unknown; onRetry: () => void }>) {
  const { t } = useTranslation();

  if (error == null || isNotFound(error)) {
    return <Navigate to="/plans" search={{ q: undefined, state: undefined, athlete: undefined }} />;
  }
  return (
    <CmvAppShell title={t("plan.title")}>
      <CmvErrorState
        title={t("common.errorTitle")}
        description={t("common.errorDescription")}
        retryLabel={t("common.retry")}
        onRetry={onRetry}
      />
    </CmvAppShell>
  );
}
