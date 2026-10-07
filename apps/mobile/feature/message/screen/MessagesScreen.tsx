import {
  AthleteConversationsScreen,
  CoachConversationsScreen,
} from "@/feature/message/screen/ConversationsScreen";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";

/**
 * L'onglet Messages, servi aux deux rôles depuis #34 — une liste de fils des deux côtés depuis
 * qu'un athlète peut être suivi par plusieurs coachs (#599).
 *
 * DEUX composants et non un `if` interne : l'athlète lit `GET /me/coaches` (athlète seul) et le
 * coach `GET /athletes` (coach seul). Les hooks React s'exécutent inconditionnellement — un
 * branchement à l'intérieur d'un composant unique ferait partir les deux requêtes et donnerait un
 * 403 à chacun sur sa propre messagerie. Même choix que côté web.
 */
export function MessagesScreen() {
  // Le titre EXERCÉ décide de l'écran : un compte qui cumule a des fils des deux côtés.
  const isCoach = useActingCapability() === "coach";
  return isCoach ? <CoachConversationsScreen /> : <AthleteConversationsScreen />;
}
