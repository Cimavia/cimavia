import { createFileRoute } from "@tanstack/react-router";
import { MessagesScreen } from "@/feature/message";

export const Route = createFileRoute("/messages")({
  component: MessagesScreen,
});
