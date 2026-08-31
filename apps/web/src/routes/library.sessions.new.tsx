import { createFileRoute } from "@tanstack/react-router";
import { SessionBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

// Le constructeur de séance (#165) — pleine page, coach seul comme le reste de la bibliothèque.
export const Route = createFileRoute("/library/sessions/new")({
  component: () => (
    <CmvRoleGate capability="coach">
      <SessionBuilderScreen sessionId={undefined} />
    </CmvRoleGate>
  ),
});
