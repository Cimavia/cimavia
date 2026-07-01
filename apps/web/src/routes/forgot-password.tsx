import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordScreen } from "@/feature/auth";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordScreen,
});
