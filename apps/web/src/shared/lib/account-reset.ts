import type { QueryClient } from "@tanstack/react-query";
import { clearPlanClipboard } from "@/feature/plan/hook/usePlanClipboard";

/**
 * Efface TOUT ce que l'onglet garde du compte quitté : le cache de requêtes et le presse-papier de
 * semaine (#341). Pendant web de `resetAccountData` côté mobile.
 *
 * POURQUOI un point d'entrée unique. Le cache seul était vidé, à trois endroits recopiés — la
 * déconnexion, la connexion, l'inscription —, et le presse-papier dans `sessionStorage` ne l'était
 * nulle part : le coach suivant sur un poste partagé voyait le titre d'un cycle d'un autre tenant.
 * Ce qui manquait n'était pas le geste mais l'endroit où le mettre ; ici, un stockage ajouté demain
 * n'a qu'une ligne à rejoindre.
 *
 * Appelée aux DEUX bouts, et les deux comptent : à la déconnexion, et à la connexion — le seul
 * passage obligé, puisqu'une session perdue ramène au login sans qu'aucune déconnexion soit passée.
 *
 * Ce qui n'y est PAS, volontairement : le suivi local des séances (`useLocalTracking`). Sa clé est
 * l'identifiant d'une séance, que le compte suivant ne peut pas ouvrir — rien n'y fuit.
 */
export function resetAccountData(queryClient: QueryClient): void {
  queryClient.clear();
  clearPlanClipboard();
}
