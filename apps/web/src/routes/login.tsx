import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "@/feature/auth";

export const Route = createFileRoute("/login")({
  component: LoginScreen,
});
