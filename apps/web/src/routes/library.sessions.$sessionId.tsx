import { createFileRoute } from "@tanstack/react-router";
import { isBlockRank, SessionBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

export const Route = createFileRoute("/library/sessions/$sessionId")({
  /**
   * `add` : l'exercice que le coach vient de créer DEPUIS cette séance (#303), à y ajouter au
   * retour. L'écran le retire de l'URL une fois lu, pour qu'un F5 ne l'ajoute pas deux fois.
   * `block` : le rang du bloc où l'ajouter (#719) ; absent, ou sans `add`, il ne dit rien.
   * `structure` : l'exercice vient d'un bloc vide ; un bloc neuf de cette structure le reçoit, au
   * rang `block`.
   */
  // L'objet vide plutôt qu'un `add: undefined` : sans ça TanStack rend `add` OBLIGATOIRE à la
  // navigation, et chaque lien vers la séance devrait passer un exercice qu'il n'a pas.
  validateSearch: (
    search: Record<string, unknown>,
  ): { add?: string; block?: number; structure?: string } => {
    const { add, block, structure } = search;
    if (typeof add !== "string" || add === "") return {};
    return {
      add,
      ...(isBlockRank(block) ? { block } : {}),
      ...(typeof structure === "string" && structure !== "" ? { structure } : {}),
    };
  },
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
        addToBlock={"block" in search ? search.block : undefined}
        addFromStructure={"structure" in search ? search.structure : undefined}
      />
    </CmvRoleGate>
  );
}
