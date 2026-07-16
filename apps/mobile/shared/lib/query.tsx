import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";

// Le cache survit à la fermeture de l'app pendant une semaine : l'athlète qui ouvre cimavia en
// salle, sans réseau, doit retrouver ses séances — c'est tout l'objet de la lecture hors-ligne.
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Les données restent « fraîches » 5 min : pas de rafale de requêtes en changeant d'onglet.
const STALE_TIME_MS = 5 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      // `gcTime` doit couvrir `maxAge` : une entrée collectée en mémoire ne serait jamais
      // réécrite sur le disque, et le cache persisté se viderait à la première ouverture.
      gcTime: CACHE_MAX_AGE_MS,
      retry: 1,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "cimavia-query-cache",
});

/**
 * Cache de requêtes PERSISTÉ (p3-5). Sans persistance, un cache purement mémoire disparaîtrait à
 * la fermeture de l'app : l'athlète hors réseau ouvrirait un écran vide.
 * Les mutations ne sont pas persistées (aucune écriture différée en MVP — cf. CDC §12).
 */
export function QueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
