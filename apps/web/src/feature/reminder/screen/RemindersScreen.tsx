import { type ReminderDto, ReminderStatus, Role } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ReminderCard } from "@/feature/reminder/component/ReminderCard";
import { useReminders, useUpdateReminderStatus } from "@/feature/reminder/hook/useReminders";
import {
  CmvAppShell,
  CmvEmptyState,
  CmvErrorState,
  CmvSegmented,
  type CmvSegmentedOption,
} from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

// Deux vues d'une même liste, servie en un appel : à traiter (l'ordre de travail, imposé par l'API)
// et traités (l'historique). Un rappel abandonné n'est pas supprimé — il reste une information.
const SEGMENTS = ["PENDING", "HANDLED"] as const;
type Segment = (typeof SEGMENTS)[number];

/**
 * « Mes rappels » (#45) — outil PRIVÉ du coach : aucun athlète n'a de rappel, et l'API refuse la
 * route en 403. D'où la garde de rôle, comme sur les autres écrans coach.
 */
export function RemindersScreen() {
  const { t } = useTranslation();
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const { data: reminders, isPending, isError, refetch } = useReminders();
  const updateStatus = useUpdateReminderStatus();
  const [segment, setSegment] = useState<Segment>("PENDING");

  if (isAuthPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  if (authSession?.user.role !== Role.COACH) {
    return <Navigate to="/" />;
  }

  const shown = (reminders ?? []).filter((reminder) =>
    segment === "PENDING"
      ? reminder.status === ReminderStatus.PENDING
      : reminder.status !== ReminderStatus.PENDING,
  );

  const options: CmvSegmentedOption<Segment>[] = SEGMENTS.map((value) => ({
    value,
    label: t(`reminder.segment.${value}`, {
      count: (reminders ?? []).filter((reminder) =>
        value === "PENDING"
          ? reminder.status === ReminderStatus.PENDING
          : reminder.status !== ReminderStatus.PENDING,
      ).length,
    }),
  }));

  return (
    <CmvAppShell title={t("reminder.title")} subtitle={t("reminder.subtitle")}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {/* Erreur, vide et chargement sont trois états distincts : « aucun rappel » sur une panne
          réseau serait un mensonge. */}
      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {!isPending && !isError && reminders != null ? (
        <div className="flex flex-col gap-cmv-lg">
          <CmvSegmented options={options} value={segment} onChange={setSegment} />

          {shown.length === 0 ? (
            <CmvEmptyState
              title={t(`reminder.empty.${segment}.title`)}
              description={t(`reminder.empty.${segment}.description`)}
            />
          ) : (
            <ReminderList
              reminders={shown}
              busy={updateStatus.isPending}
              onSetStatus={(id, status) => updateStatus.mutate({ id, status })}
            />
          )}
        </div>
      ) : null}
    </CmvAppShell>
  );
}

type ReminderListProps = {
  reminders: ReminderDto[];
  busy: boolean;
  onSetStatus: (id: string, status: ReminderDto["status"]) => void;
};

function ReminderList({ reminders, busy, onSetStatus }: Readonly<ReminderListProps>) {
  return (
    <div className="flex flex-col gap-cmv-sm">
      {reminders.map((reminder) => (
        <ReminderCard
          key={reminder.id}
          reminder={reminder}
          busy={busy}
          onMarkDone={() => onSetStatus(reminder.id, ReminderStatus.DONE)}
          onDismiss={() => onSetStatus(reminder.id, ReminderStatus.DISMISSED)}
          onReopen={() => onSetStatus(reminder.id, ReminderStatus.PENDING)}
        />
      ))}
    </div>
  );
}
