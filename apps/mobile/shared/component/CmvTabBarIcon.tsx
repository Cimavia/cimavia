import { Ionicons } from "@expo/vector-icons";
import type { ReactElement } from "react";
import type { ColorValue } from "react-native";
import type { TabDefinition } from "@/shared/lib/tabs";

type TabBarIconProps = Readonly<{ color: ColorValue; size: number }>;
type TabBarIcon = (props: TabBarIconProps) => ReactElement;

const byIcon = new Map<TabDefinition["icon"], TabBarIcon>();

/**
 * L'icône d'un onglet, sous la forme qu'attend `tabBarIcon` : une fonction de la couleur et de la
 * taille que la barre choisit (onglet actif ou non).
 *
 * Fabriquée ici et non écrite en ligne dans `app/(app)/_layout.tsx` (#504, S6478) : déclarée dans
 * le layout, elle serait recréée à chaque rendu, et `app/` ne porte que du routing (règle dure
 * n°4). Une par icône, gardée en cache : la barre reçoit la MÊME fonction d'un rendu à l'autre.
 */
export function tabBarIconFor(icon: TabDefinition["icon"]): TabBarIcon {
  const cached = byIcon.get(icon);
  if (cached != null) return cached;

  const render: TabBarIcon = ({ color, size }) => (
    <Ionicons name={icon} color={color} size={size} />
  );
  byIcon.set(icon, render);
  return render;
}
