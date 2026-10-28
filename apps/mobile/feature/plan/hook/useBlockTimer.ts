import {
  blockHeading,
  blockRun,
  formatTrainingDuration,
  type ReadBlock,
  type RunStep,
  RunStepKind,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTimeline } from "@/feature/plan/hook/useTimeline";
import { timelineAlerts, useTimerNotification } from "@/feature/plan/hook/useTimerNotification";
import { vibrateTimerDone } from "@/feature/plan/lib/timer-alert";

// i18n-values plan.clock.title: RunStepKind

/**
 * Le chrono d'un bloc (#722) : son déroulé (`blockRun`), joué par le moteur commun, avec la
 * vibration et les notifications d'un exercice. Rien n'y coche : le suivi reste au geste de
 * l'athlète (*Tranché en #722*). `steps` est vide quand le bloc n'a rien à chronométrer.
 */
export function useBlockTimer(read: ReadBlock | null) {
  const { t } = useTranslation();
  const timeline = useTimeline<RunStep, ReadBlock>(isAwaiting, (_read, step) => {
    // « J'ai fini » est le geste de l'athlète : il n'a pas besoin qu'on le lui signale.
    if (step.kind !== RunStepKind.DO) vibrateTimerDone();
  });
  const steps = useMemo(
    () => (read == null ? [] : blockRun(read.block.settings, read.exercises.length)),
    [read],
  );

  const { deadline, segments, index, context } = timeline;
  const alerts = useMemo(
    () =>
      context == null
        ? []
        : timelineAlerts(
            { deadline, segments, index },
            `${blockHeading(context)} · ${context.block.name}`,
            isAwaiting,
            (next) => alertBody(next, t),
          ),
    [deadline, segments, index, context, t],
  );
  const { armed } = useTimerNotification(alerts);

  return {
    ...timeline,
    steps,
    armed,
    run: () => {
      if (read != null) timeline.start(steps, read);
    },
  };
}

function isAwaiting(step: RunStep): boolean {
  return step.kind === RunStepKind.DO;
}

/** Ce que la notification annonce : l'étape qui COMMENCE, ou la fin du bloc. */
function alertBody(next: RunStep | undefined, t: TFunction): string {
  if (next == null) return t("plan.clock.lastBody");
  if (next.kind === RunStepKind.DO) return t("plan.timer.awaiting");
  return t("plan.timer.nextBody", {
    segment: t(`plan.clock.title.${next.kind}`),
    duration: formatTrainingDuration(next.seconds),
  });
}
