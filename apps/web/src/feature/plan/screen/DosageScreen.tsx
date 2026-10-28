import {
  blockNumbers,
  canWrite,
  type DosageColumn,
  DosageColumnKind,
  type DosageSessionType,
  dosageColumns,
  dosageInput,
  dosageRoundsIssues,
  dosageSessionTypes,
  type MetricValue,
  type PlanDto,
  PlanStatus,
  required,
  revertedDosage,
  type ScheduledSessionCopyDto,
  withDosageCell,
  withDosageSetting,
} from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DosageTable, type DosageTarget } from "@/feature/plan/component/DosageTable";
import {
  scheduledSessionCopiesQuery,
  usePlan,
  usePlanMutations,
} from "@/feature/plan/hook/usePlan";
import {
  CmvAppShell,
  CmvButton,
  CmvEmptyState,
  CmvErrorState,
  CmvLeaveDialog,
  CmvSelect,
  CmvStaleBanner,
} from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { confirmLeave, useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
import { isStaleWriteError } from "@/shared/lib/api";
import { newId } from "@/shared/util/new-id.util";

/**
 * Dosage (#721, maquette `coach_planification_blocs` frames 3 à 5) : les valeurs d'une séance-type
 * du cycle, semaine par semaine — une colonne par copie posée. Le cycle s'y règle séance-type par
 * séance-type (`?type`, la première par défaut). Les valeurs ne se règlent qu'ici, la composition
 * que dans le panneau (#720) : chaque colonne rouvre le panneau de sa semaine.
 */
export function DosageScreen() {
  const { t } = useTranslation();
  const { planId } = useParams({ from: "/plans/$planId_/dosage" });
  const { type } = useSearch({ from: "/plans/$planId_/dosage" });
  const plan = usePlan(planId);
  const types = useMemo(() => dosageSessionTypes(plan.data?.weeks ?? []), [plan.data]);
  // Sans `?type`, la première séance-type À L'OUVERTURE : le cycle relu en fond peut en mettre
  // une autre en tête, et la page ne doit pas changer de séance-type sous la saisie.
  const [opening, setOpening] = useState<string | null>(null);
  const first = types[0]?.key ?? null;
  if (opening === null && first !== null) setOpening(first);

  // Une relecture qui échoue garde ce qui est lu : seule une première lecture en panne se dit ici.
  if (plan.data == null) {
    return plan.isError ? (
      <DosageUnreadable onRetry={() => void plan.refetch()} />
    ) : (
      <DosageLoading />
    );
  }
  const current = types.find((each) => each.key === (type ?? opening)) ?? types[0];
  if (current === undefined) {
    return (
      <CmvAppShell title={t("plan.dosage.title")}>
        <div className="flex flex-col gap-cmv-md">
          <BackToPlan planId={plan.data.id} />
          <CmvEmptyState
            title={t("plan.dosage.empty.title")}
            description={t("plan.dosage.empty.description")}
          />
        </div>
      </CmvAppShell>
    );
  }
  return (
    <DosageLoader
      // Une autre séance-type : ses copies, relues, et un brouillon neuf. Sa clé, pas sa première
      // copie : le cycle relu en fond (retour sur l'onglet) ne doit pas jeter la saisie.
      key={current.key}
      plan={plan.data}
      types={types}
      current={current}
      onReloadPlan={async () => {
        const fresh = await plan.refetch();
        if (fresh.isError) throw fresh.error;
      }}
    />
  );
}

type DosageLoaderProps = {
  plan: PlanDto;
  types: readonly DosageSessionType[];
  current: DosageSessionType;
  onReloadPlan: () => Promise<void>;
};

/**
 * Les copies de la séance-type, RELUES à chaque ouverture, même en cache : un geste du panneau a pu
 * faire avancer une semaine, et « Enregistrer » citerait la version d'avant (#604). Une copie en
 * cache ne suffit donc pas : l'éditeur n'ouvre que sur une lecture réussie. Ouvert, il le reste —
 * une relecture qui échoue le dit, sans jeter la saisie.
 *
 * La copie qui les désigne est figée à l'ouverture : celle que le cycle relu met en tête peut
 * changer, la séance-type non.
 */
function DosageLoader({ onReloadPlan, ...props }: Readonly<DosageLoaderProps>) {
  const [anchorId] = useState(props.current.anchorId);
  const [isOpen, setOpen] = useState(false);
  const copies = useQuery({ ...scheduledSessionCopiesQuery(anchorId), refetchOnMount: "always" });
  const isRead = copies.isFetchedAfterMount && !copies.isError && copies.data != null;
  if (isRead && !isOpen) setOpen(true);

  if (!isOpen && !isRead) {
    return copies.isError ? (
      <DosageUnreadable onRetry={() => void copies.refetch()} />
    ) : (
      <DosageLoading />
    );
  }
  return (
    <DosageEditor
      {...props}
      anchorId={anchorId}
      copies={required(copies.data, "copies lues à l'ouverture")}
      // Le cycle avec : une copie déplacée, ou posée dans une semaine neuve, change les colonnes.
      onReload={async () => {
        const [fresh] = await Promise.all([copies.refetch(), onReloadPlan()]);
        if (fresh.isError) throw fresh.error;
        return required(fresh.data, "copies relues");
      }}
    />
  );
}

function DosageUnreadable({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation();
  return (
    <CmvAppShell title={t("plan.dosage.title")}>
      <CmvErrorState
        title={t("common.errorTitle")}
        description={t("common.errorDescription")}
        retryLabel={t("common.retry")}
        onRetry={onRetry}
      />
    </CmvAppShell>
  );
}

function DosageLoading() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
      {t("common.loading")}
    </main>
  );
}

/** Le retour au cycle, comme « ← Planifications » le fait depuis le cycle. */
function BackToPlan({ planId }: Readonly<{ planId: string }>) {
  const { t } = useTranslation();
  return (
    <Link
      to="/plans/$planId"
      params={{ planId }}
      className="text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi"
    >
      {t("plan.dosage.back")}
    </Link>
  );
}

type DosageEditorProps = Omit<DosageLoaderProps, "onReloadPlan"> & {
  /** La copie par laquelle Dosage lit et enregistre la séance-type. */
  anchorId: string;
  copies: readonly ScheduledSessionCopyDto[];
  /** Relit les copies et le cycle après un conflit ; rejette si la relecture échoue. */
  onReload: () => Promise<readonly ScheduledSessionCopyDto[]>;
};

/**
 * Le brouillon de la page : les copies telles que le Coach les règle, et celles qu'il a lues, sous
 * leurs versions. Une copie relue en fond ne remplace pas le brouillon : « Enregistrer » citerait
 * sinon une version que la saisie n'a pas vue.
 */
function DosageEditor({
  plan,
  types,
  current,
  anchorId,
  copies,
  onReload,
}: Readonly<DosageEditorProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const athleteLabel = useAthleteLabel();
  const { onError } = useMutationToast();
  const text = usePhraseText();
  const { doseSession, isBusy } = usePlanMutations(plan.id);
  const refused = useRefusedFields();
  const [base, setBase] = useState(copies);
  const [drafts, setDrafts] = useState(copies);
  const [isReloading, setReloading] = useState(false);

  const input = useMemo(() => dosageInput(drafts, base), [drafts, base]);
  const isDirty = input.length > 0 || refused.hasRefused;
  const readOnly = !canWrite(required(plan.myAccess, "droit du coach sur son cycle"));
  const athleteName =
    plan.athleteId == null || plan.athleteName == null
      ? t("plan.session.dosage.theAthlete")
      : athleteLabel(plan.athleteId, plan.athleteName);
  const columns = useMemo(() => dosageColumns(plan.weeks, drafts), [plan.weeks, drafts]);
  const issues = useMemo(() => roundsIssues(drafts, columns, t, text), [drafts, columns, t, text]);

  /** Vrai si tout est parti — ou s'il n'y avait rien à envoyer. Ne rejette jamais (#682). */
  async function save(): Promise<boolean> {
    if (refused.hasRefused || issues.length > 0) return false;
    if (input.length === 0) return true;
    try {
      const saved = await doseSession.mutateAsync({
        sessionId: anchorId,
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
      setBase(fresh);
      setDrafts(fresh);
      doseSession.reset();
    } catch (error) {
      // La saisie reste : le bandeau aussi, et « Recharger » se retente.
      onError(error);
    } finally {
      setReloading(false);
    }
  }

  /** Une autre séance-type : le brouillon de celle-ci se garde, ou se perd, d'abord (#682). */
  async function selectType(key: string) {
    if ((await confirmLeave()) === "stay") return;
    guard.release();
    void navigate({
      to: "/plans/$planId/dosage",
      params: { planId: plan.id },
      search: { type: key },
    });
  }

  return (
    <CmvAppShell
      title={current.title}
      subtitle={t("plan.dosage.subtitle", { name: athleteName })}
      actions={
        <>
          {current.sourceSessionId == null ? null : (
            // Un autre onglet : le brouillon reste ici, intact.
            <a
              href={`/library/sessions/${current.sourceSessionId}`}
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
              disabled={!isDirty || refused.hasRefused || issues.length > 0 || isBusy}
              onClick={() => void save()}
            >
              {isDirty ? t("plan.dosage.save") : t("plan.dosage.saved")}
            </CmvButton>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-cmv-md">
        <BackToPlan planId={plan.id} />
        {types.length > 1 ? (
          <div className="max-w-sm">
            <CmvSelect
              label={t("plan.dosage.sessionType")}
              name="dosageSessionType"
              value={current.key}
              onChange={(event) => void selectType(event.target.value)}
              options={types.map((each) => ({ value: each.key, label: each.title }))}
            />
          </div>
        ) : null}

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

        {issues.length === 0 ? null : (
          <ul className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-error-line bg-cmv-error-soft px-cmv-md py-cmv-sm text-cmv-caption text-cmv-error-on">
            {issues.map((issue) => (
              <li key={issue.id}>{issue.text}</li>
            ))}
          </ul>
        )}

        <RefusedFieldsContext value={refused.report}>
          <DosageTable
            columns={columns}
            copies={drafts}
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

/**
 * Des tours que les réglages d'une semaine refusent — trop peu de bips pour ses exercices : rien ne
 * part tant qu'il en reste, et chacun dit sa semaine et son bloc.
 */
function roundsIssues(
  copies: readonly ScheduledSessionCopyDto[],
  columns: readonly DosageColumn[],
  t: TFunction,
  text: ReturnType<typeof usePhraseText>,
): { id: string; text: string }[] {
  const weekOf = new Map(
    columns.flatMap((column) =>
      column.kind === DosageColumnKind.COPY ? [[column.copyId, column.weekNumber] as const] : [],
    ),
  );
  return copies.flatMap((copy) => {
    const number = weekOf.get(copy.id);
    const week = number === undefined ? "—" : t("plan.composition.week", { number });
    const numbers = blockNumbers(copy.blocks);
    return dosageRoundsIssues(copy).map(({ blockIndex, phrase }) => ({
      id: `${copy.id}:${blockIndex}`,
      text: t("plan.dosage.roundsIssue", {
        week,
        block: numbers[blockIndex] ?? copy.blocks[blockIndex]?.label ?? "—",
        reason: text([phrase]),
      }),
    }));
  });
}
