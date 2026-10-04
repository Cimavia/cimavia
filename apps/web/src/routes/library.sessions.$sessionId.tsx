import { createFileRoute } from "@tanstack/react-router";
import { SessionBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

export const Route = createFileRoute("/library/sessions/$sessionId")({
  /**
   * `add` : l'exercice que le coach vient de créer DEPUIS cette séance (#303), à y ajouter au
   * retour. L'écran le retire de l'URL une fois lu, pour qu'un F5 ne l'ajoute pas deux fois.
   */
  // L'objet vide plutôt qu'un `add: undefined` : sans ça TanStack rend `add` OBLIGATOIRE à la
  // navigation, et chaque lien vers la séance devrait passer un exercice qu'il n'a pas.
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.add === "string" && search.add !== "" ? { add: search.add } : {},
  component: RouteComponent,
});

function RouteComponent() {
  const { sessionId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <CmvRoleGate capability="coach">
      <SessionBuilderScreen
        sessionId={sessionId}
        addExerciseId={"add" in search ? search.add : undefined}
      />
    </CmvRoleGate>
  );
}
