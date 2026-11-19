import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/feature/auth";
import { ExerciseBuilderScreen } from "@/feature/library";

export const Route = createFileRoute("/library/exercises/$exerciseId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { exerciseId } = Route.useParams();
  return (
    <RoleGate capability="coach">
      <ExerciseBuilderScreen exerciseId={exerciseId} initialTitle={undefined} />
    </RoleGate>
  );
}
