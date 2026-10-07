import { useRouter } from "expo-router";
import { revokeCurrentPushToken } from "@/feature/notification";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";

/**
 * La déconnexion, dans l'ordre qui la rend sûre (#345). Partagée par le profil et l'écran du
 * compte Entreprise (#600) : une copie qui inverserait deux gestes passerait inaperçue.
 */
export function useLogout(): () => Promise<void> {
  const router = useRouter();
  return async () => {
    // Détacher l'appareil AVANT de fermer la session : la route de révocation est scopée à
    // l'utilisateur connecté, elle n'aurait plus d'effet après le signOut.
    await revokeCurrentPushToken();
    await authClient.signOut();
    // Le cookie part, ce que l'appareil garde RESTAIT — cache persisté sept jours et frais cinq
    // minutes, documents descendus pour le hors-ligne : tout était resservi au compte suivant.
    await resetAccountData();
    router.replace("/login");
  };
}
