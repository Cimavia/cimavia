import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "@/feature/home";

export const Route = createFileRoute("/")({
  component: HomeScreen,
});
