import { createFileRoute } from "@tanstack/react-router";
import { AthletesScreen } from "@/feature/athlete";

export const Route = createFileRoute("/athletes")({
  component: AthletesScreen,
});
