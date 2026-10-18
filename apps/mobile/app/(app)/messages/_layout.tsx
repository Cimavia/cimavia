import { Stack } from "expo-router";

// L'onglet Messages porte une PILE : la liste des conversations, puis une conversation ou l'écran
// qui en crée une (#612) — pour les deux rôles depuis qu'un athlète a plusieurs coachs (#599).
export default function MessagesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
