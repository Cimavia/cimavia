import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/feature/auth";
import { StructureBuilderScreen } from "@/feature/library";

export const Route = createFileRoute("/library/structures/$structureId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { structureId } = Route.useParams();
  return (
    <RoleGate capability="coach">
      <StructureBuilderScreen structureId={structureId} />
    </RoleGate>
  );
}
