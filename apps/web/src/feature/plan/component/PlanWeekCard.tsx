import type { PlanWeekDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import { PlanWeekType, planWeekDays } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { PlanDayCell } from "@/feature/plan/component/PlanDayCell";
import { PLAN_WEEK_TYPES } from "@/feature/plan/constant";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import { usePlanClipboard } from "@/feature/plan/hook/usePlanClipboard";
import { useWeekDrag, type WeekSlot } from "@/feature/plan/hook/useWeekDrag";
import { dayAfterDrop } from "@/feature/plan/util/week-drop.util";
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
  week: PlanWeekDto;
  onAddSession: (date: string) => void;
  onEditSession: (session: ScheduledSessionSummaryDto) => void;
};

export function PlanWeekCard({
  planId,
  planTitle,
  isPublished,
  week,
  onAddSession,
  onEditSession,
}: Readonly<PlanWeekCardProps>) {
  const { t } = useTranslation();
  const { updateWeek, removeWeek, pasteWeek, reorderDay, isBusy } = usePlanMutations(planId);
  const { clipboard, copyWeek } = usePlanClipboard();

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
    if (clipboard == null || clipboard.planWeekId === week.id) return null;

    if (isPublished) {
      return (
        <CmvButton variant="ghost" disabled title={t("plan.week.pasteDisabledPublished")}>
          {t("plan.week.paste")}
        </CmvButton>
      );
    }

    const onPaste = () =>
      pasteWeek.mutate({ targetWeekId: week.id, sourcePlanWeekId: clipboard.planWeekId });

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

  const days = planWeekDays(week.startDate) ?? [];
  const sessionsByDay = new Map<string, ScheduledSessionSummaryDto[]>();
  for (const session of week.sessions) {
    const existing = sessionsByDay.get(session.scheduledDate) ?? [];
    existing.push(session);
    sessionsByDay.set(session.scheduledDate, existing);
  }

  // La décharge est l'exception du cycle : elle se repère au liseré, sans avoir à lire le
  // sélecteur de type semaine par semaine. L'entraînement, lui, reste neutre (design system).
  const isDeload = week.type === PlanWeekType.DELOAD;

  const sessionsOn = (date: string) => sessionsByDay.get(date) ?? [];

  // Une seule journée est écrite : celle d'arrivée. Le serveur retire la séance de son jour
  // d'origine et l'y recolle — deux écritures feraient deux notifications pour un seul geste.
  function onDrop(from: WeekSlot, to: WeekSlot) {
    const day = dayAfterDrop(sessionsOn(from.date), sessionsOn(to.date), from, to);
    if (day == null) return;
    reorderDay.mutate({ weekId: week.id, ...day });
  }

  // Le chemin clavier de la poignée : un cran, DANS la journée. Sortir du jour se fait au glisser,
  // ou par le sélecteur « Jour » du panneau — qui reste, lui, entièrement accessible au clavier.
  function moveWithinDay(date: string, index: number, direction: -1 | 1) {
    onDrop({ date, index }, { date, index: index + direction });
  }

  const drag = useWeekDrag(onDrop);

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
          onChange={(type) => updateWeek.mutate({ weekId: week.id, input: { type } })}
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

        <CmvConfirmButton
          label={t("plan.week.delete")}
          confirmLabel={t("common.confirmDelete")}
          cancelLabel={t("common.cancel")}
          disabled={isBusy}
          onConfirm={() => removeWeek.mutate(week.id)}
        />
      </header>

      {week.note == null ? null : <p className="text-cmv-caption text-cmv-text-mid">{week.note}</p>}

      <div className="grid grid-cols-2 gap-cmv-sm md:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => (
          <PlanDayCell
            key={day}
            date={day}
            sessions={sessionsByDay.get(day) ?? []}
            isBusy={isBusy}
            drag={drag}
            onAddSession={onAddSession}
            onEditSession={onEditSession}
            onMoveWithinDay={moveWithinDay}
          />
        ))}
      </div>
    </section>
  );
}
