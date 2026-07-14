import { createFileRoute } from "@tanstack/react-router";
import { PlanBuilderScreen } from "@/feature/plan";

export const Route = createFileRoute("/plans/$planId")({
  component: PlanBuilderScreen,
});
