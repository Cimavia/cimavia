import { createFileRoute } from "@tanstack/react-router";
import { LibraryScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

// Bibliothèque d'exercices et de séances : coach seul, et elle le RESTE — la création reste
// web-only et côté coach, décision explicite de #20.
export const Route = createFileRoute("/library/")({
  component: () => (
    <CmvRoleGate capability="coach">
      <LibraryScreen />
    </CmvRoleGate>
  ),
});
