import { type ExerciseDto, Role, type SessionDto } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseForm } from "@/feature/library/component/ExerciseForm";
import { ExerciseList } from "@/feature/library/component/ExerciseList";
import { SessionBuilder } from "@/feature/library/component/SessionBuilder";
import { SessionList } from "@/feature/library/component/SessionList";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { CmvAppShell, CmvButton, CmvTabs } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

type LibraryTab = "exercises" | "sessions";

export function LibraryScreen() {
  const { t } = useTranslation();
  // `authSession` = session d'authentification, à ne pas confondre avec la Session métier (séance).
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();

  const [tab, setTab] = useState<LibraryTab>("exercises");
  const [exercisePanelOpen, setExercisePanelOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseDto | null>(null);
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionDto | null>(null);

  // Compteurs d'onglets : totaux (non filtrés). Mêmes clés de cache que les listes → pas de
  // requête supplémentaire pour les séances ; les exercices non filtrés sont une entrée à part.
  const { data: allExercises } = useExercises({});
  const { data: allSessions } = useSessions();

  if (isAuthPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  // Bibliothèque = surface coach uniquement (l'API refuse déjà l'athlète en 403).
  if (authSession?.user.role !== Role.COACH) {
    return <Navigate to="/" />;
  }

  const isSessionsTab = tab === "sessions";

  function openCreate() {
    if (isSessionsTab) {
      setEditingSession(null);
      setSessionPanelOpen(true);
      return;
    }
    setEditingExercise(null);
    setExercisePanelOpen(true);
  }

  function openEditExercise(exercise: ExerciseDto) {
    setEditingExercise(exercise);
    setExercisePanelOpen(true);
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
          <ExerciseList onCreate={openCreate} onEdit={openEditExercise} />
        )}
      </div>

      {/* `key` : le formulaire se réinitialise à chaque élément édité. */}
      {exercisePanelOpen ? (
        <ExerciseForm
          key={editingExercise?.id ?? "new-exercise"}
          open={exercisePanelOpen}
          exercise={editingExercise}
          onClose={() => setExercisePanelOpen(false)}
        />
      ) : null}

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
