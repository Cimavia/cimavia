import { createFileRoute } from "@tanstack/react-router";
import { ExerciseBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

// Le constructeur d'exercice (#163) — pleine page, et coach seul comme le reste de la bibliothèque.
export const Route = createFileRoute("/library/exercises/new")({
  /**
   * `title` pré-rempli depuis le vide de recherche : le coach a tapé « gainage », n'a rien trouvé,
   * et crée l'exercice manquant sans avoir à retaper ce qu'il vient d'écrire.
   */
  validateSearch: (search: Record<string, unknown>) => ({
    title: typeof search.title === "string" ? search.title : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { title } = Route.useSearch();
  return (
    <CmvRoleGate capability="coach">
      <ExerciseBuilderScreen initialTitle={title} />
    </CmvRoleGate>
  );
}
