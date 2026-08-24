import { createFileRoute } from "@tanstack/react-router";
import { ExerciseBuilderScreen } from "@/feature/library";
import { CmvRoleGate } from "@/shared/component";

export const Route = createFileRoute("/library/exercises/$exerciseId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { exerciseId } = Route.useParams();
  return (
    <CmvRoleGate capability="coach">
      <ExerciseBuilderScreen exerciseId={exerciseId} initialTitle={undefined} />
    </CmvRoleGate>
  );
}
