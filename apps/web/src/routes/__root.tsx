import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { BundleUpdateContext, useBundleUpdate } from "@/shared/hook/useBundleUpdate";
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
  // Ici et pas dans `CmvAppShell`, que chaque écran remonte : ce qui a été vu survit à la
  // navigation, et la vérification ne repart pas à chaque page (#290).
  const isUpdateAvailable = useBundleUpdate();

  return (
    <BundleUpdateContext value={isUpdateAvailable}>
      <Outlet />
    </BundleUpdateContext>
  );
}
