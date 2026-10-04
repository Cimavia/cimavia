import { useQueryClient } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { offlineSignature, syncOfflineDocuments } from "@/feature/plan/lib/offline-documents";

/**
 * Descend sur l'appareil ce que l'athlète devra lire sans réseau (#95).
 *
 * MONTÉ DANS LE PLANNING, et pas à l'ouverture d'une séance : en salle il est trop tard, c'est
 * justement là que le réseau manque. Le planning est l'écran d'accueil de l'athlète — la passe se
 * déclenche donc au moment où il consulte sa semaine, chez lui, en ligne.
 *
 * Faute de tâche de fond (aucune n'est installée, et iOS n'en garantit aucune échéance), « à la
 * diffusion » se lit « au premier passage de l'app en ligne après la diffusion ». La notification
 * push de diffusion amène l'athlète dans l'app : c'est ce passage qu'on utilise.
 *
 * Une passe n'est RETENUE que complète (#307). Une passe coupée se reprend aux deux moments où ce
 * qui l'a fait échouer a pu changer : le retour du réseau, et le retour de l'app au premier plan.
 * Pas en boucle tant qu'on reste en ligne : une API en panne ferait enchaîner les échecs.
 *
 * `isInternetReachable` est indéterminé au premier rendu, et vaut alors « en ligne », comme dans
 * le reste de l'app. Ce n'est plus un risque : une passe lancée à tort échoue, n'est pas retenue,
 * et repart quand le réseau revient.
 */
export function useOfflineDocuments() {
  const queryClient = useQueryClient();
  const { data: plans } = useMyPlans();
  const network = useNetworkState();
  const isOnline = network.isInternetReachable !== false;

  const signature = offlineSignature(plans ?? []);
  const synced = useRef<string | null>(null);
  const running = useRef(false);
  // Le dernier essai armé. Des cycles arrivés PENDANT une passe ont vu leur essai heurter
  // `running` : c'est par lui qu'on les rattrape quand elle se termine.
  const latest = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (plans == null || !isOnline) {
      latest.current = null;
      return;
    }

    const attempt = () => {
      if (running.current || synced.current === signature) return;

      running.current = true;
      void syncOfflineDocuments(queryClient, plans)
        .then((complete) => {
          if (complete) synced.current = signature;
        })
        .finally(() => {
          running.current = false;
          if (latest.current !== attempt) latest.current?.();
        });
    };

    latest.current = attempt;
    attempt();

    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") attempt();
    });
    return () => subscription.remove();
  }, [plans, signature, isOnline, queryClient]);
}
