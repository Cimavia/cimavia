// Sentry AVANT tout autre import — le SDK doit être armé quand les modules ci-dessous
// s'évaluent, sinon un crash à leur initialisation part sans trace (cf. instrument.ts).
// Le groupe isolé par des lignes vides est ce qui empêche Biome de le retrier ailleurs.
import "./instrument";

import "./index.css";
import "./shared/lib/i18n";

import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import { CmvCrashScreen } from "./shared/component/CmvCrashScreen";
import { ToastProvider } from "./shared/component/CmvToast";
import { recheckSession } from "./shared/lib/auth";
import { createQueryClient } from "./shared/lib/query-client";

// Un 401 fait relire la session ; la garde de route décide de la suite (#336).
const queryClient = createQueryClient(recheckSession);

const router = createRouter({
  routeTree,
  context: { queryClient },
  /**
   * Le filet sous les erreurs non maîtrisées. Sa portée s'arrête au routeur : ce qui casse
   * AU-DESSUS — les deux providers ci-dessous, ou l'évaluation de `./shared/lib/i18n` — tombe
   * toujours à l'écran blanc. Écart assumé (#181) : ces modules ne dépendent d'aucune donnée, ce
   * qui les casse casse tout le reste, et un boundary de plus n'aurait rien de mieux à afficher.
   * Sentry, lui, les entend quand même — c'est le rôle de l'import de `./instrument` en tête.
   */
  defaultErrorComponent: ({ error }) => <CmvCrashScreen error={error} />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
