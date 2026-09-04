import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useSentryUser } from "@/shared/hook/useSentryUser";

type RouterContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  // Le seul composant monté sur TOUTES les routes, écrans d'authentification compris — donc le
  // seul endroit d'où l'identité Sentry suit vraiment la session.
  useSentryUser();

  return <Outlet />;
}
