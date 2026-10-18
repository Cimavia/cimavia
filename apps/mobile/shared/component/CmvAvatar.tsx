import { initialsOf } from "@cmv/shared";
import { View } from "react-native";
import { CmvText } from "./CmvText";

/**
 * Pastille d'identité : les initiales sur un fond NEUTRE (tranché en #598 — le design system n'a
 * pas de palette décorative, et une couleur par personne se lirait comme un état).
 *
 * Pendant mobile de `CmvAvatar` (web), sans la photo de profil que le mobile ne sert pas encore.
 * Un nom vide rend un carré sans initiale : l'information exacte, là où un « ? » l'inventerait.
 */
export function CmvAvatar({ name }: Readonly<{ name: string }>) {
  return (
    <View className="h-9 w-9 items-center justify-center rounded-md border border-cmv-border bg-cmv-surface-hi">
      <CmvText className="font-cmv-display text-cmv-text-mid text-xs">{initialsOf(name)}</CmvText>
    </View>
  );
}
