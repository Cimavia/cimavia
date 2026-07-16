import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

type CmvScreenProps = {
  children: ReactNode;
  className?: string;
};

// Fond sombre PAR DÉFAUT : le thème du MVP est unique. Un `bg-white` en dur ici gagnait sur les
// classes passées par les écrans (l'ordre des classes ne décide pas, c'est la règle CSS générée).
export function CmvScreen({ children, className }: CmvScreenProps) {
  return (
    <SafeAreaView className={`flex-1 bg-cmv-bg-0 ${className ?? ""}`}>{children}</SafeAreaView>
  );
}
