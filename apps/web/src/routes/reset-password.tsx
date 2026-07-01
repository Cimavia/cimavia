import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordScreen } from "@/feature/auth";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordScreen,
});
