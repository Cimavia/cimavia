import { createFileRoute } from "@tanstack/react-router";
import { SessionBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

export const Route = createFileRoute("/library/sessions/$sessionId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { sessionId } = Route.useParams();
  return (
    <CmvRoleGate capability="coach">
      <SessionBuilderScreen sessionId={sessionId} />
    </CmvRoleGate>
  );
}
