import { createFileRoute } from "@tanstack/react-router";
import { LibraryScreen } from "@/feature/library";
import { librarySearchOf } from "@/feature/library/util/library-tab.util";
import { CmvRoleGate } from "@/shared/component";

// Bibliothèque d'exercices, de séances et de structures : coach seul, et elle le RESTE — la création reste
// web-only et côté coach, décision explicite de #20.
export const Route = createFileRoute("/library/")({
  // L'onglet dans l'URL (#717) : un constructeur y ramène, et le retour arrière y retombe.
  validateSearch: librarySearchOf,
  component: () => (
    <CmvRoleGate capability="coach">
      <LibraryScreen />
    </CmvRoleGate>
  ),
});
