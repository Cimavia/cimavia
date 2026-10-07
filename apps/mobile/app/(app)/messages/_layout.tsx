import { Stack } from "expo-router";

// L'onglet Messages porte une PILE : la liste des fils puis un fil, pour les deux rôles depuis
// qu'un athlète peut être suivi par plusieurs coachs (#599).
export default function MessagesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
