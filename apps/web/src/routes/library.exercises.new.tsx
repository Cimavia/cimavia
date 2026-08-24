import { createFileRoute } from "@tanstack/react-router";
import { ExerciseBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

// Le constructeur d'exercice (#163) — pleine page, et coach seul comme le reste de la bibliothèque.
export const Route = createFileRoute("/library/exercises/new")({
  component: () => (
    <CmvRoleGate capability="coach">
      <ExerciseBuilderScreen />
    </CmvRoleGate>
  ),
});
