import { createFileRoute } from "@tanstack/react-router";
import { RemindersScreen } from "@/feature/reminder";

export const Route = createFileRoute("/reminders")({
  component: RemindersScreen,
});
