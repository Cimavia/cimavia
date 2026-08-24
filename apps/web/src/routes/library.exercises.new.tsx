import { createFileRoute } from "@tanstack/react-router";
import { ExerciseBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

// Le constructeur d'exercice (#163) — pleine page, et coach seul comme le reste de la bibliothèque.
export const Route = createFileRoute("/library/exercises/new")({
  /**
   * `title` pré-rempli depuis le vide de recherche : le coach a tapé « gainage », n'a rien trouvé,
   * et crée l'exercice manquant sans avoir à retaper ce qu'il vient d'écrire.
   */
  // L'objet vide plutôt qu'un `title: undefined` : sans ça TanStack rend `title` OBLIGATOIRE à
  // la navigation, et chaque appel devrait passer un paramètre qu'il n'a pas.
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.title === "string" ? { title: search.title } : {},
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  const title = "title" in search ? search.title : undefined;
  return (
    <CmvRoleGate capability="coach">
      <ExerciseBuilderScreen initialTitle={title} />
    </CmvRoleGate>
  );
}
