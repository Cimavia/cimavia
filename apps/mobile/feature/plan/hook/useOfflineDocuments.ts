import { useQueryClient } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { useEffect, useRef } from "react";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { syncOfflineDocuments } from "@/feature/plan/lib/offline-documents";

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
 */
export function useOfflineDocuments() {
  const queryClient = useQueryClient();
  const { data: plans } = useMyPlans();
  const network = useNetworkState();
  const isOnline = network.isInternetReachable !== false;

  // Ce qui rend une passe NÉCESSAIRE : des cycles différents, ou un cycle ajusté depuis. Sans ce
  // repère, l'identité du tableau — neuve à chaque refetch, fût-il identique — relancerait une
  // passe complète toutes les cinq minutes.
  const signature = (plans ?? []).map((plan) => `${plan.id}:${plan.updatedAt}`).join("|");
  const synced = useRef<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (plans == null || !isOnline || running.current) return;
    if (synced.current === signature) return;

    synced.current = signature;
    running.current = true;
    void syncOfflineDocuments(queryClient, plans).finally(() => {
      running.current = false;
    });
  }, [plans, signature, isOnline, queryClient]);
}
