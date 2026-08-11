import { CoachConversationsScreen } from "@/feature/message/screen/CoachConversationsScreen";
import { ConversationScreen } from "@/feature/message/screen/ConversationScreen";
import { useCapabilities } from "@/shared/hook/useCapabilities";

/**
 * L'onglet Messages, servi aux deux rôles depuis #34.
 *
 * DEUX composants et non un `if` interne : l'athlète lit `GET /me/coach` (athlète seul) et le coach
 * `GET /athletes` (coach seul). Les hooks React s'exécutent inconditionnellement — un branchement
 * à l'intérieur d'un composant unique ferait partir les deux requêtes et donnerait un 403 à chacun
 * sur sa propre messagerie. Même choix que côté web.
 */
export function MessagesScreen() {
  const { isCoach } = useCapabilities();
  return isCoach ? <CoachConversationsScreen /> : <ConversationScreen />;
}
