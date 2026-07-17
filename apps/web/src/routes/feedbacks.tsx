import { createFileRoute } from "@tanstack/react-router";
import { FeedbacksScreen } from "@/feature/feedback";

export const Route = createFileRoute("/feedbacks")({
  component: FeedbacksScreen,
});
