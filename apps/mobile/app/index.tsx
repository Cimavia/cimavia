import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useCounterparts } from "@/feature/account/hook/useCounterparts";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { landingTab } from "@/shared/lib/tabs";

/**
 * Gate de session : aiguille vers le login (déconnecté) ou vers le premier onglet de la capacité
 * (connecté).
 *
 * La destination est DÉRIVÉE de la table d'onglets et non codée en dur : envoyer tout le monde sur
 * `/planning` faisait prendre un 403 à un coach, `GET /me/plan` étant `@Roles([ATHLETE])`. Le jour
 * où un onglet coach est ajouté en tête, l'entrée le suit sans qu'on y touche.
 *
 * `null` = aucun onglet visible, donc aucune capacité connue (fail closed de `capabilitiesOf`) :
 * on déconnecte plutôt que d'ouvrir une app vide dont on ne pourrait plus sortir.
 */
export default function Index() {
  const { isPending, isAuthenticated, isCoach, isAthlete } = useCapabilities();
  const counterparts = useCounterparts();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-cmv-bg-0">
        <ActivityIndicator />
      </View>
    );
  }

  if (!isAuthenticated) return <Redirect href="/login" />;

  const landing = landingTab({ isCoach, isAthlete }, counterparts);
  return <Redirect href={landing ?? "/login"} />;
}
