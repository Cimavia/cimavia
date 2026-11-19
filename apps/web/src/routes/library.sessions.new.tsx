import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/feature/auth";
import { SessionBuilderScreen } from "@/feature/library";

// Le constructeur de séance (#165) — pleine page, coach seul comme le reste de la bibliothèque.
export const Route = createFileRoute("/library/sessions/new")({
  component: () => (
    <RoleGate capability="coach">
      <SessionBuilderScreen sessionId={undefined} />
    </RoleGate>
  ),
});
