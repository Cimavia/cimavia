import { createFileRoute } from "@tanstack/react-router";
import { PlansScreen } from "@/feature/plan";

export const Route = createFileRoute("/plans/")({
  component: PlansScreen,
});
