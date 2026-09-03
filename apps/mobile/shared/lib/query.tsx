import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { addNetworkStateListener } from "expo-network";
import type { ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

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
 * **À INCRÉMENTER dès qu'un DTO gagne un champ que le rendu lit sans garde.**
 *
 * Le cache ci-dessus survit SEPT JOURS à la fermeture de l'app, et il contient des charges utiles
 * sérialisées telles que l'API les rendait à l'époque. Ajouter un champ côté serveur — un tableau,
 * typiquement — le laisse donc `undefined` sur toutes les entrées déjà en mémoire, alors que le
 * type promet qu'il est là : l'écran plante à la première lecture, chez l'utilisateur seulement,
 * et pendant une semaine. C'est exactement ce qui est arrivé aux réponses d'un débrief (#194) :
 * `SessionFeedbackDto.messages` a été ajouté, et un débrief déjà consulté rendait un
 * « Cannot read property 'map' of undefined ».
 *
 * `buster` est la réponse prévue par TanStack : un cache persisté sous une autre valeur est
 * INTÉGRALEMENT jeté au démarrage. Le coût est une première ouverture qui recharge — bien moindre
 * qu'un écran mort. La parade inverse (un `?? []` dans chaque composant) ne protégerait que
 * l'endroit auquel on a pensé, et masquerait le vrai problème partout ailleurs.
 *
 * À remplacer par la version du produit quand elle existera (#184).
 */
const CACHE_SCHEMA_VERSION = "2";

/**
 * Ponts app ↔ TanStack Query. Sans eux, RIEN ne déclenche jamais de refetch : `refetchOnWindowFocus`
 * s'appuie sur les événements du navigateur, absents en React Native. Le cache étant persisté et
 * frais 5 min, l'athlète pouvait rouvrir l'app et relire un cycle supprimé la veille — sans le
 * moindre signe que ce qu'il voyait était périmé.
 *
 * Deux signaux, aux deux moments où les données ont pu changer sans qu'on le sache :
 *  - retour au premier plan (le coach a ajusté la planif pendant que l'app dormait) ;
 *  - retour du réseau (sortie de la salle, du métro).
 *
 * Posé au niveau du module, une seule fois : ce sont des abonnements natifs globaux, pas un effet
 * de composant — les remonter à chaque rendu empilerait les écouteurs.
 */
AppState.addEventListener("change", (status: AppStateStatus) => {
  focusManager.setFocused(status === "active");
});

onlineManager.setEventListener((setOnline) => {
  const subscription = addNetworkStateListener(({ isInternetReachable }) => {
    // `isInternetReachable` est indéterminé tant que la sonde n'a pas abouti : on ne déclare pas
    // l'app hors-ligne sur un « je ne sais pas » — ce serait bloquer des requêtes qui passeraient.
    setOnline(isInternetReachable !== false);
  });
  return () => subscription.remove();
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
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS, buster: CACHE_SCHEMA_VERSION }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
