import { createFileRoute } from "@tanstack/react-router";
import { DashboardScreen } from "@/feature/dashboard";

export const Route = createFileRoute("/")({
  component: DashboardScreen,
});
