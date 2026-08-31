import { formatTrainingDuration } from "@cmv/shared";
import { Pressable } from "react-native";
import { CmvText } from "@/shared/component";

type DurationChipProps = {
  seconds: number;
  label: string;
  onStart: (seconds: number) => void;
};

/**
 * Une durée affichée est LANÇABLE d'un tap : le chiffre EST le bouton.
 *
 * La règle vaut partout où une durée apparaît — repos, effort, intervalle. Elle évite un bouton
 * « démarrer » à côté de chaque nombre, et elle rend le geste évident : on tape ce qu'on veut
 * chronométrer.
 *
 * La pastille fait 32 px de haut, sous les 44 px recommandés : inline dans un texte à 25 px
 * d'interligne, on ne peut pas faire mieux sans disloquer la phrase. `hitSlop` étend la zone
 * tactile de 6 px sur chaque bord pour rattraper l'écart.
 */
export function DurationChip({ seconds, label, onStart }: Readonly<DurationChipProps>) {
  return (
    <Pressable
      onPress={() => onStart(seconds)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-8 justify-center rounded-full border border-cmv-accent-line bg-cmv-accent-soft px-3"
    >
      <CmvText className="font-cmv-mono text-cmv-accent-on text-sm">
        {formatTrainingDuration(seconds) ?? "—"}
      </CmvText>
    </Pressable>
  );
}
