import { createFileRoute, Outlet } from "@tanstack/react-router";
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
 */
export const Route = createFileRoute("/sessions/$sessionId")({
  component: () => (
    <CmvRoleGate capability="athlete">
      <Outlet />
    </CmvRoleGate>
  ),
});
