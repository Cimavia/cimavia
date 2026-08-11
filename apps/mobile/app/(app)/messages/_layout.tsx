import { Stack } from "expo-router";

// L'onglet Messages porte une PILE : la liste des fils (coach) puis un fil. Côté athlète la pile
// n'a qu'un écran — il n'a qu'un fil, il n'y a rien à empiler.
export default function MessagesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
