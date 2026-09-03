// Sentry AVANT tout autre import — le SDK doit être armé quand les modules ci-dessous
// s'évaluent, sinon un crash à leur initialisation part sans trace (cf. instrument.ts).
// Le groupe isolé par des lignes vides est ce qui empêche Biome de le retrier ailleurs.
import "./instrument";

import "./index.css";
import "./shared/lib/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import { ToastProvider } from "./shared/component/CmvToast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
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
