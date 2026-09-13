import { createFileRoute, Outlet } from "@tanstack/react-router";
import { parsePlanningSearch } from "@/routes/planning";
import { CmvRoleGate } from "@/shared/component";

/**
 * Layout du sous-arbre `/sessions/$sessionId/*` : le détail (`.index`) et le débrief (`feedback`).
 *
 * Ce fichier n'est pas facultatif — sans lui, le générateur de routes produit un parent
 * `SessionsSessionIdRoute` **référencé mais jamais défini**, et toute route enfant répond
 * « Not Found ». Un segment qui a des enfants doit avoir son layout, et ce layout doit rendre
 * `<Outlet />`.
 *
 * La garde de capacité est posée ICI plutôt que sur chaque enfant : tout ce qui vit sous une séance
 * de l'athlète lui est réservé, et une garde unique ne peut pas diverger entre deux frères.
 *
 * `?from=<lundi>` est la semaine du PLANNING d'où l'athlète est venu (#251), relayée telle quelle
 * pour que « ← Mon planning » rouvre exactement l'URL quittée. Validée ici, sur le layout, parce
 * qu'elle voyage de la séance au débrief et retour ; et par LE validateur du planning, parce que
 * c'est la même donnée — un second parseur finirait par diverger du premier. Absente quand on
 * arrive d'ailleurs (liste Séances, message, notification) : il n'y a alors aucune semaine à rendre.
 */
export const Route = createFileRoute("/sessions/$sessionId")({
  validateSearch: parsePlanningSearch,
  component: () => (
    <CmvRoleGate capability="athlete">
      <Outlet />
    </CmvRoleGate>
  ),
});
