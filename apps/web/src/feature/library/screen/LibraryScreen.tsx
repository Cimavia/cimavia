import type { SessionDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseList } from "@/feature/library/component/ExerciseList";
import { SessionBuilder } from "@/feature/library/component/SessionBuilder";
import { SessionList } from "@/feature/library/component/SessionList";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { CmvAppShell, CmvButton, CmvTabs } from "@/shared/component";

type LibraryTab = "exercises" | "sessions";

export function LibraryScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [tab, setTab] = useState<LibraryTab>("exercises");
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionDto | null>(null);

  // Compteurs d'onglets : totaux (non filtrés). Mêmes clés de cache que les listes → pas de
  // requête supplémentaire pour les séances ; les exercices non filtrés sont une entrée à part.
  const { data: allExercises } = useExercises({});
  const { data: allSessions } = useSessions();

  const isSessionsTab = tab === "sessions";

  function openCreate() {
    if (isSessionsTab) {
      setEditingSession(null);
      setSessionPanelOpen(true);
      return;
    }
    // L'exercice se construit sur une PAGE, pas dans un tiroir (#163).
    navigate({ to: "/library/exercises/new" });
  }

  function openEditSession(session: SessionDto) {
    setEditingSession(session);
    setSessionPanelOpen(true);
  }

  return (
    <CmvAppShell
      title={t("library.title")}
      subtitle={t("library.subtitle")}
      actions={
        <CmvButton onClick={openCreate}>
          {isSessionsTab ? t("library.newSession") : t("library.newExercise")}
        </CmvButton>
      }
    >
      <div className="flex flex-col gap-cmv-xl">
        <CmvTabs
          value={tab}
          onChange={setTab}
          tabs={[
            {
              value: "exercises",
              label: t("library.tabs.exercises"),
              ...(allExercises ? { count: allExercises.length } : {}),
            },
            {
              value: "sessions",
              label: t("library.tabs.sessions"),
              ...(allSessions ? { count: allSessions.length } : {}),
            },
          ]}
        />

        {isSessionsTab ? (
          <SessionList onCreate={openCreate} onEdit={openEditSession} />
        ) : (
          <ExerciseList />
        )}
      </div>

      {/* `key` : le formulaire se réinitialise à chaque élément édité. */}
      {sessionPanelOpen ? (
        <SessionBuilder
          key={editingSession?.id ?? "new-session"}
          open={sessionPanelOpen}
          session={editingSession}
          onClose={() => setSessionPanelOpen(false)}
        />
      ) : null}
    </CmvAppShell>
  );
}
