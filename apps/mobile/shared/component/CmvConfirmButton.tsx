import { useState } from "react";
import { Pressable, View } from "react-native";
import { CmvText } from "./CmvText";

type CmvConfirmButtonProps = {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
};

/**
 * Action destructive en deux temps : un 1er appui **arme** le bouton, le 2e confirme.
 *
 * Le premier motif de confirmation de l'app mobile — il n'en existait aucun, et aucun
 * `Alert.alert` non plus. Deux raisons de ne pas prendre l'alerte native, qui aurait été le
 * réflexe : elle n'est ni stylable (elle ignore NativeWind, donc les tokens) ni observable par le
 * harnais de rendu, qui monte l'arbre en `react-native-web` (dette **Q-6**) — un geste protégé par
 * une alerte serait un geste non éprouvé.
 *
 * C'est donc le même dispositif que `CmvConfirmButton` côté web, et la parité est le point : un
 * refus d'invitation doit demander la même chose des deux côtés, sans quoi l'un des deux finirait
 * par la perdre.
 *
 * L'armement ne se désarme PAS tout seul — pas de minuterie. Un bouton qui redevient inoffensif
 * après quelques secondes rend le geste dépendant du temps de réaction, et il n'y a rien à
 * protéger contre un appui différé : c'est le double appui qu'on veut, pas sa vitesse.
 */
export function CmvConfirmButton({
  label,
  confirmLabel,
  cancelLabel,
  onConfirm,
  disabled,
}: Readonly<CmvConfirmButtonProps>) {
  const [armed, setArmed] = useState(false);
  const dimmed = disabled === true ? "opacity-50" : "";

  if (!armed) {
    return (
      <Pressable
        onPress={() => setArmed(true)}
        disabled={disabled}
        className={`rounded-lg border border-cmv-error px-4 py-3 ${dimmed}`}
      >
        <CmvText className="text-center text-cmv-error">{label}</CmvText>
      </Pressable>
    );
  }

  return (
    <View className="flex-row gap-2">
      <Pressable
        onPress={() => {
          setArmed(false);
          onConfirm();
        }}
        disabled={disabled}
        className={`flex-1 rounded-lg bg-cmv-error px-4 py-3 ${dimmed}`}
      >
        <CmvText className="text-center text-cmv-text-hi">{confirmLabel}</CmvText>
      </Pressable>
      <Pressable
        onPress={() => setArmed(false)}
        disabled={disabled}
        className={`flex-1 rounded-lg border border-cmv-border px-4 py-3 ${dimmed}`}
      >
        <CmvText className="text-center text-cmv-text-mid">{cancelLabel}</CmvText>
      </Pressable>
    </View>
  );
}
