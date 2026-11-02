import { Pressable } from "react-native";
import { CmvText } from "./CmvText";

type CmvToggleChipProps = {
  pressed: boolean;
  onToggle: () => void;
  label: string;
};

/**
 * Une pastille de filtre À CHOIX UNIQUE, posée dans un ruban qui défile (`ScrollView horizontal`,
 * rôle `radiogroup`).
 *
 * Le pendant mobile du `CmvToggleChip` web, né du filtre des factures (#224) puis repris par le
 * centre de notifications (#694). Il garde le dessin des factures — bordure marquée et fond relevé
 * — plutôt que l'accent du web : c'est celui que la maquette mobile a validé. Le libellé est une
 * chaîne et non un nœud : sa couleur suit l'état, et le composant la porte.
 */
export function CmvToggleChip({ pressed, onToggle, label }: Readonly<CmvToggleChipProps>) {
  return (
    <Pressable
      onPress={onToggle}
      // Bouton radio, comme les cartes exclusives de l'inscription : un filtre à choix unique, que
      // retoucher n'éteint pas. `aria-checked` et non `accessibilityState` : même sens en natif, et
      // rendu sous `react-native-web` — l'état s'éprouve donc en test (dette Q-6).
      accessibilityRole="radio"
      aria-checked={pressed}
      className={`shrink-0 rounded-full border px-4 py-2 ${
        pressed ? "border-cmv-border-hi bg-cmv-surface-hi" : "border-cmv-border bg-cmv-surface"
      }`}
    >
      <CmvText className={`text-xs ${pressed ? "text-cmv-text-hi" : "text-cmv-text-mid"}`}>
        {label}
      </CmvText>
    </Pressable>
  );
}
