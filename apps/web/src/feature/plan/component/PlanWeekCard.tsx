import type { PlanWeekDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import { PlanWeekType, planWeekDays, required } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { PlanDayCell } from "@/feature/plan/component/PlanDayCell";
import { PLAN_WEEK_TYPES } from "@/feature/plan/constant";
import type { CycleDrag } from "@/feature/plan/hook/useCycleDrag";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import { usePlanClipboard } from "@/feature/plan/hook/usePlanClipboard";
import { CmvBadge, CmvButton, CmvConfirmButton, CmvSegmented } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatDateRange } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.weekType: PlanWeekType

type PlanWeekCardProps = {
  planId: string;
  planTitle: string;
  isPublished: boolean;
  /**
   * Le cycle d'un autre Coach, ouvert en Lecture (#607) : la semaine se lit et se copie — vers un
   * cycle qu'on écrit —, rien ne s'y change.
   */
  readOnly: boolean;
  week: PlanWeekDto;
  /** Le glisser du CYCLE, tenu par l'écran : une séance passe d'une semaine à l'autre (#689). */
  drag: CycleDrag;
  onAddSession: (date: string) => void;
  onEditSession: (session: ScheduledSessionSummaryDto) => void;
};

export function PlanWeekCard({
  planId,
  planTitle,
  isPublished,
  readOnly,
  week,
  drag,
  onAddSession,
  onEditSession,
}: Readonly<PlanWeekCardProps>) {
  const { t } = useTranslation();
  const { updateWeek, removeWeek, pasteWeek, isBusy } = usePlanMutations(planId);
  const { clipboard, copyWeek } = usePlanClipboard();
  // Retirer une semaine d'un cycle diffusé décalerait le planning de l'athlète (l'API refuse,
  // #312) : le geste reste visible, fermé, avec sa raison.
  const deleteClosed = isPublished
    ? { disabledReason: t("plan.week.deleteDisabledPublished") }
    : {};

  /**
   * Le bouton « Coller ici » n'apparaît qu'une fois une semaine copiée, et jamais sur celle qui
   * l'a été. Trois formes, selon ce que le geste va faire :
   *  - cycle DIFFUSÉ → désactivé, avec sa raison. Le masquer laisserait croire que la feature
   *    n'existe pas, alors que le builder reste éditable sur un cycle diffusé (CDC §5.7) ;
   *  - semaine cible VIDE → un clic suffit, rien n'est détruit ;
   *  - semaine cible OCCUPÉE → confirmation armée annonçant le nombre de séances remplacées,
   *    comme pour une suppression (le collage remplace, il ne fusionne pas).
   */
  function renderPasteAction() {
    if (readOnly || clipboard == null || clipboard.planWeekId === week.id) return null;

    if (isPublished) {
      return (
        <CmvButton variant="ghost" disabled title={t("plan.week.pasteDisabledPublished")}>
          {t("plan.week.paste")}
        </CmvButton>
      );
    }

    const onPaste = () =>
      pasteWeek.mutate({
        targetWeekId: week.id,
        sourcePlanWeekId: clipboard.planWeekId,
        expectedUpdatedAt: week.updatedAt,
      });

    if (week.sessions.length === 0) {
      return (
        <CmvButton variant="secondary" disabled={isBusy} onClick={onPaste}>
          {t("plan.week.paste")}
        </CmvButton>
      );
    }

    return (
      <CmvConfirmButton
        label={t("plan.week.paste")}
        confirmLabel={t("plan.week.pasteConfirm", { count: week.sessions.length })}
        cancelLabel={t("common.cancel")}
        disabled={isBusy}
        onConfirm={onPaste}
      />
    );
  }

  // Le lundi d'une semaine servie par l'API est une date valide (#512).
  const days = required(planWeekDays(week.startDate), "lundi de semaine illisible");
  const sessionsByDay = new Map<string, ScheduledSessionSummaryDto[]>();
  for (const session of week.sessions) {
    const existing = sessionsByDay.get(session.scheduledDate) ?? [];
    existing.push(session);
    sessionsByDay.set(session.scheduledDate, existing);
  }

  // La décharge est l'exception du cycle : elle se repère au liseré, sans avoir à lire le
  // sélecteur de type semaine par semaine. L'entraînement, lui, reste neutre (design system).
  const isDeload = week.type === PlanWeekType.DELOAD;

  return (
    <section
      className={cn(
        "flex flex-col gap-cmv-md rounded-cmv-lg border border-cmv-border bg-cmv-surface p-cmv-lg",
        isDeload && "border-l-4 border-l-cmv-info",
      )}
    >
      <header className="flex flex-wrap items-center gap-cmv-md">
        <h3 className="text-cmv-subtitle text-cmv-text-hi">
          {t("plan.week.number", { number: week.weekNumber })}
        </h3>
        <span className="text-cmv-caption text-cmv-text-lo">
          {formatDateRange(week.startDate, week.endDate)}
        </span>

        <CmvSegmented<PlanWeekType>
          value={week.type}
          disabled={isBusy || readOnly}
          onChange={(type) =>
            updateWeek.mutate({
              weekId: week.id,
              input: { type, expectedUpdatedAt: week.updatedAt },
            })
          }
          options={PLAN_WEEK_TYPES.map((type) => ({
            value: type,
            label: t(`plan.weekType.${type}`),
          }))}
        />

        <div className="flex-1" />

        <CmvBadge>{t("plan.week.sessionCount", { count: week.sessions.length })}</CmvBadge>

        {/* Copier reste offert sur un cycle diffusé : lire une semaine ne la modifie pas, et
            « reprendre le bloc du mois dernier » est le cas d'usage même de la feature. */}
        <CmvButton
          variant="ghost"
          onClick={() =>
            copyWeek({
              planWeekId: week.id,
              planId,
              planTitle,
              weekNumber: week.weekNumber,
            })
          }
        >
          {t("plan.week.copy")}
        </CmvButton>
        {renderPasteAction()}

        {readOnly ? null : (
          <CmvConfirmButton
            label={t("plan.week.delete")}
            confirmLabel={t("common.confirmDelete")}
            cancelLabel={t("common.cancel")}
            disabled={isBusy}
            {...deleteClosed}
            onConfirm={() =>
              removeWeek.mutate({ weekId: week.id, expectedUpdatedAt: week.updatedAt })
            }
          />
        )}
      </header>

      {week.note == null ? null : <p className="text-cmv-caption text-cmv-text-mid">{week.note}</p>}

      <div className="grid grid-cols-2 gap-cmv-sm md:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => (
          <PlanDayCell
            key={day}
            weekId={week.id}
            date={day}
            sessions={sessionsByDay.get(day) ?? []}
            isBusy={isBusy}
            readOnly={readOnly}
            drag={drag}
            onAddSession={onAddSession}
            onEditSession={onEditSession}
            onMoveWithinDay={drag.moveWithinDay}
          />
        ))}
      </div>
    </section>
  );
}
