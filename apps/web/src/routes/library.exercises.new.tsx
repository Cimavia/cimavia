import { createFileRoute } from "@tanstack/react-router";
import { ExerciseBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

// Le constructeur d'exercice (#163) — pleine page, et coach seul comme le reste de la bibliothèque.
export const Route = createFileRoute("/library/exercises/new")({
  /**
   * `title` pré-rempli depuis le vide de recherche : le coach a tapé « gainage », n'a rien trouvé,
   * et crée l'exercice manquant sans avoir à retaper ce qu'il vient d'écrire.
   *
   * `session` : la séance d'où il est parti (#303), où le ramener. Un id et non un chemin : la
   * cible se reconstruit ici, l'URL ne peut donc envoyer nulle part ailleurs.
   */
  // Des clés ABSENTES plutôt qu'un `title: undefined` : sans ça TanStack les rend OBLIGATOIRES à
  // la navigation, et chaque appel devrait passer des paramètres qu'il n'a pas.
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.title === "string" ? { title: search.title } : {}),
    ...(typeof search.session === "string" && search.session !== ""
      ? { session: search.session }
      : {}),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { title, session } = Route.useSearch();
  return (
    <CmvRoleGate capability="coach">
      <ExerciseBuilderScreen initialTitle={title} fromSessionId={session} />
    </CmvRoleGate>
  );
}
