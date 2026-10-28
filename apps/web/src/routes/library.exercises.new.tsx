import { createFileRoute } from "@tanstack/react-router";
import { ExerciseBuilderScreen, isBlockRank } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

// Le constructeur d'exercice (#163) — pleine page, et coach seul comme le reste de la bibliothèque.
export const Route = createFileRoute("/library/exercises/new")({
  /**
   * `title` pré-rempli depuis le vide de recherche : le coach a tapé « gainage », n'a rien trouvé,
   * et crée l'exercice manquant sans avoir à retaper ce qu'il vient d'écrire.
   *
   * `session` : la séance d'où il est parti (#303), où le ramener. Un id et non un chemin : la
   * cible se reconstruit ici, l'URL ne peut donc envoyer nulle part ailleurs.
   *
   * `block` : le rang du bloc où l'exercice entrera au retour (#719) — un rang et non un id, que
   * l'enregistrement de la séance régénère. Absent, l'exercice arrive dans un bloc neuf.
   *
   * `structure` : parti d'un bloc vide, que l'enregistrement de la séance a laissé de côté, la
   * structure du bloc neuf qui recevra l'exercice au rang `block` — clé prête ou id du Coach.
   */
  // Des clés ABSENTES plutôt qu'un `title: undefined` : sans ça TanStack les rend OBLIGATOIRES à
  // la navigation, et chaque appel devrait passer des paramètres qu'il n'a pas.
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.title === "string" ? { title: search.title } : {}),
    ...(typeof search.session === "string" && search.session !== ""
      ? { session: search.session }
      : {}),
    ...blockOf(search.block),
    ...(typeof search.structure === "string" && search.structure !== ""
      ? { structure: search.structure }
      : {}),
  }),
  component: RouteComponent,
});

function blockOf(block: unknown): { block?: number } {
  return isBlockRank(block) ? { block } : {};
}

function RouteComponent() {
  const { title, session, block, structure } = Route.useSearch();
  return (
    <CmvRoleGate capability="coach">
      <ExerciseBuilderScreen
        initialTitle={title}
        fromSessionId={session}
        fromBlock={block}
        fromStructure={structure}
      />
    </CmvRoleGate>
  );
}
