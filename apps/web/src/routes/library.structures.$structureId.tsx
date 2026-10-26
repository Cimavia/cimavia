import { createFileRoute } from "@tanstack/react-router";
import { StructureBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

export const Route = createFileRoute("/library/structures/$structureId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { structureId } = Route.useParams();
  return (
    <CmvRoleGate capability="coach">
      <StructureBuilderScreen structureId={structureId} />
    </CmvRoleGate>
  );
}
