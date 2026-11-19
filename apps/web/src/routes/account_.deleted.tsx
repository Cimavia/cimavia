import { createFileRoute } from "@tanstack/react-router";
import { AccountDeletedScreen } from "@/feature/account";

/** Sans garde : le compte vient de disparaître, `RoleGate` ouvrirait la reconnexion (#795). */
export const Route = createFileRoute("/account_/deleted")({
  component: AccountDeletedScreen,
});
