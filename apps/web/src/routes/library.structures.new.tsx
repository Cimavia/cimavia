import { createFileRoute } from "@tanstack/react-router";
import { StructureBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

// Créer une structure (#717) — pleine page, coach seul comme le reste de la bibliothèque.
export const Route = createFileRoute("/library/structures/new")({
  /**
   * `from` : la structure copiée — la clé d'une structure prête, ou l'id d'une structure du Coach.
   * L'écran retrouve l'une ou l'autre dans la bibliothèque ; inconnue, il ouvre une structure neuve.
   */
  // La clé ABSENTE plutôt qu'un `from: undefined` : sans ça TanStack la rend OBLIGATOIRE à la
  // navigation, et « Nouvelle structure » devrait passer une source qu'il n'a pas.
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.from === "string" && search.from !== "" ? { from: search.from } : {},
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  return (
    <CmvRoleGate capability="coach">
      <StructureBuilderScreen from={"from" in search ? search.from : undefined} />
    </CmvRoleGate>
  );
}
