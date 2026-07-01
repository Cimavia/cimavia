import { createFileRoute } from "@tanstack/react-router";
import { RegisterScreen } from "@/feature/auth";

export const Route = createFileRoute("/register")({
  component: RegisterScreen,
});
