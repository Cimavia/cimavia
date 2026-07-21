import { createFileRoute } from "@tanstack/react-router";
import { InvoicesScreen } from "@/feature/invoice";

export const Route = createFileRoute("/invoices")({
  component: InvoicesScreen,
});
