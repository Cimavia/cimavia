import { useRouter } from "expo-router";
import { revokeCurrentPushToken } from "@/feature/notification";
import { useSessionDeparture } from "@/shared/hook/useSessionGuard";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";

/**
 * La déconnexion, dans l'ordre qui la rend sûre (#345). Partagée par le profil et l'écran du
 * compte Entreprise (#600) : une copie qui inverserait deux gestes passerait inaperçue.
 */
export function useLogout(): () => Promise<void> {
  const router = useRouter();
  const departure = useSessionDeparture();
  return async () => {
    // Avant tout : le plugin Expo vide la session AVANT d'appeler le réseau, et la fenêtre de
    // reconnexion resterait affichée le temps de la purge (#439).
    departure.begin();
    // Détacher l'appareil AVANT de fermer la session : la route de révocation est scopée à
    // l'utilisateur connecté, elle n'aurait plus d'effet après le signOut.
    await revokeCurrentPushToken();
    // Hors ligne, `signOut` rejette APRÈS avoir vidé la session locale : le geste continue, seule la
    // session côté serveur reste à expirer.
    await authClient.signOut().catch(() => {});
    // Le cookie part, ce que l'appareil garde RESTAIT — cache persisté sept jours et frais cinq
    // minutes, documents descendus pour le hors-ligne : tout était resservi au compte suivant.
    // Une purge qui résiste n'arrête pas le départ : la prochaine connexion repurgera.
    await resetAccountData().catch(() => {});
    router.replace("/login");
    departure.complete();
  };
}
