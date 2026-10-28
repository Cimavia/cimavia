import {
  AdjustmentLevel,
  canWrite,
  type DosageColumn,
  dosageColumns,
  dosageInput,
  type MetricValue,
  type PlanDto,
  PlanStatus,
  required,
  revertedDosage,
  type ScheduledSessionCopyDto,
  type ScheduledSessionDto,
  withDosageCell,
  withDosageSetting,
} from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdjustmentMarker } from "@/feature/library/component/AdjustmentMarker";
import { DosageTable, type DosageTarget } from "@/feature/plan/component/DosageTable";
import {
  scheduledSessionDetailQuery,
  usePlan,
  usePlanMutations,
  useScheduledSessionCopies,
} from "@/feature/plan/hook/usePlan";
import {
  CmvAppShell,
  CmvButton,
  CmvErrorState,
  CmvLeaveDialog,
  CmvStaleBanner,
} from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
import { isStaleWriteError } from "@/shared/lib/api";
import { newId } from "@/shared/util/new-id.util";

/**
 * Dosage (#721, maquette `coach_planification_blocs` frames 3 à 5) : toutes les valeurs d'une
 * séance planifiée, semaine par semaine — une colonne par copie de sa séance-type dans le Plan.
 * Les valeurs ne se règlent qu'ici, la composition que dans le panneau (#720) : chaque colonne
 * rouvre le panneau de sa semaine.
 */
export function DosageScreen() {
  const { t } = useTranslation();
  const { planId, sessionId } = useParams({ from: "/plans/$planId_/dosage/$sessionId" });
  const plan = usePlan(planId);
  const copies = useScheduledSessionCopies(sessionId);
  const session = useQuery(scheduledSessionDetailQuery(sessionId));

  if (plan.isError || copies.isError || session.isError) {
    return (
      <CmvAppShell title={t("plan.dosage.title")}>
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => {
            void plan.refetch();
            void copies.refetch();
            void session.refetch();
          }}
        />
      </CmvAppShell>
    );
  }
  if (plan.data == null || copies.data == null || session.data == null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  return (
    <DosageEditor
      plan={plan.data}
      session={session.data}
      copies={copies.data}
      // Le cycle avec : une copie déplacée, ou posée dans une semaine neuve, change les colonnes.
      onReload={async () => {
        const [fresh] = await Promise.all([copies.refetch(), plan.refetch()]);
        return fresh.data ?? null;
      }}
    />
  );
}

type DosageEditorProps = {
  plan: PlanDto;
  session: ScheduledSessionDto;
  copies: readonly ScheduledSessionCopyDto[];
  /** Relit les copies après un conflit, ou `null` si la relecture échoue. */
  onReload: () => Promise<readonly ScheduledSessionCopyDto[] | null>;
};

/**
 * Le brouillon de la page : les copies telles que le Coach les règle, et celles qu'il a lues, sous
 * leurs versions. Une copie relue en fond ne remplace pas le brouillon : « Enregistrer » citerait
 * sinon une version que la saisie n'a pas vue.
 */
function DosageEditor({ plan, session, copies, onReload }: Readonly<DosageEditorProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const athleteLabel = useAthleteLabel();
  const { doseSession, isBusy } = usePlanMutations(plan.id);
  const refused = useRefusedFields();
  const [base, setBase] = useState(copies);
  const [drafts, setDrafts] = useState(copies);
  const [isReloading, setReloading] = useState(false);

  const input = dosageInput(drafts, base);
  const isDirty = input.length > 0 || refused.hasRefused;
  const readOnly = !canWrite(required(plan.myAccess, "droit du coach sur son cycle"));
  const athleteName =
    plan.athleteId == null || plan.athleteName == null
      ? t("plan.session.dosage.theAthlete")
      : athleteLabel(plan.athleteId, plan.athleteName);
  const columns: DosageColumn[] = dosageColumns(plan.weeks, drafts);

  /** Vrai si tout est parti — ou s'il n'y avait rien à envoyer. Ne rejette jamais (#682). */
  async function save(): Promise<boolean> {
    if (refused.hasRefused) return false;
    if (input.length === 0) return true;
    try {
      const saved = await doseSession.mutateAsync({
        sessionId: session.id,
        input: { sessions: input },
      });
      setBase(saved);
      setDrafts(saved);
      return true;
    } catch {
      return false;
    }
  }
  const guard = useLeaveGuard(isDirty, save);

  function update(
    copyId: string,
    change: (copy: ScheduledSessionCopyDto) => ScheduledSessionCopyDto,
  ) {
    setDrafts((current) => current.map((copy) => (copy.id === copyId ? change(copy) : copy)));
  }

  function onChange(copyId: string, target: DosageTarget, values: readonly MetricValue[]) {
    update(copyId, (copy) => {
      if (target.kind === "metric") {
        const { blockIndex, key, metric } = target;
        return {
          ...copy,
          blocks: withDosageCell(copy.blocks, blockIndex, key, metric.id, values, newId),
        };
      }
      // Une valeur du bloc est exigée : sa saisie ne remonte jamais vide.
      const [amount] = values;
      if (typeof amount !== "number") return copy;
      return {
        ...copy,
        blocks: withDosageSetting(copy.blocks, target.blockIndex, target.field, amount),
      };
    });
  }

  async function reload() {
    setReloading(true);
    try {
      const fresh = await onReload();
      if (fresh == null) return;
      setBase(fresh);
      setDrafts(fresh);
      doseSession.reset();
    } finally {
      setReloading(false);
    }
  }

  return (
    <CmvAppShell
      title={session.title}
      subtitle={t("plan.dosage.subtitle", { name: athleteName })}
      actions={
        <>
          {session.sourceSessionId == null ? null : (
            // Un autre onglet : le brouillon reste ici, intact.
            <a
              href={`/library/sessions/${session.sourceSessionId}`}
              target="_blank"
              rel="noreferrer"
              className="text-cmv-caption text-cmv-accent-on underline"
            >
              {t("plan.composition.viewSessionType")}
            </a>
          )}
          {readOnly ? null : (
            <CmvButton
              variant="primary"
              disabled={!isDirty || refused.hasRefused || isBusy}
              onClick={() => void save()}
            >
              {isDirty ? t("plan.dosage.save") : t("plan.dosage.saved")}
            </CmvButton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-cmv-md">
        <nav
          aria-label={t("plan.dosage.breadcrumb")}
          className="flex flex-wrap items-center gap-cmv-xs text-cmv-caption"
        >
          <Link
            to="/plans/$planId"
            params={{ planId: plan.id }}
            className="text-cmv-text-mid hover:text-cmv-text-hi"
          >
            {t("plan.builder.titleWithAthlete", { title: plan.title, name: athleteName })}
          </Link>
          <span aria-hidden="true" className="text-cmv-text-lo">
            /
          </span>
          <span className="text-cmv-text-hi">{t("plan.dosage.title")}</span>
        </nav>

        {isStaleWriteError(doseSession.error) ? (
          <CmvStaleBanner
            message={t("plan.dosage.stale")}
            onReload={() => void reload()}
            isReloading={isReloading}
          />
        ) : null}
        {plan.status === PlanStatus.PUBLISHED ? (
          <p className="text-cmv-caption text-cmv-warning-on">
            {t("plan.composition.willSeeUpdate", { name: athleteName })}
          </p>
        ) : null}

        <div className="flex flex-col gap-cmv-xs">
          <p className="text-cmv-caption text-cmv-text-mid">{t("plan.dosage.intro")}</p>
          <div className="flex flex-wrap items-center gap-cmv-md text-cmv-caption text-cmv-text-lo">
            <span className="flex items-center gap-cmv-xs">
              <AdjustmentMarker level={AdjustmentLevel.SCHEDULED} />
              {t("plan.dosage.legend.adjusted", { name: athleteName })}
            </span>
            <span>{t("plan.dosage.legend.off")}</span>
          </div>
        </div>

        <RefusedFieldsContext value={refused.report}>
          <DosageTable
            columns={columns}
            copies={drafts}
            focusId={session.id}
            readOnly={readOnly}
            onChange={onChange}
            onRevertCopy={(copyId) =>
              update(copyId, (copy) => ({ ...copy, blocks: revertedDosage(copy.blocks) }))
            }
            onCompose={(copyId) =>
              void navigate({
                to: "/plans/$planId",
                params: { planId: plan.id },
                search: { session: copyId },
              })
            }
          />
        </RefusedFieldsContext>
      </div>
      <CmvLeaveDialog {...guard.dialog} />
    </CmvAppShell>
  );
}
