import { useState } from "react";
import { Pressable, View } from "react-native";
import { CmvText } from "./CmvText";

/**
 * L'habillage AU REPOS, et le poids que le geste prend une fois armé. Mêmes noms que les variantes
 * du `CmvButton` web (`secondary`, `ghost`, `danger`) : un pied de page qui range trois actions
 * doit pouvoir les hiérarchiser des deux côtés avec le même mot.
 *
 * `danger` reste le défaut, et reste l'habillage historique : un geste destructif s'annonce dès le
 * repos. `ghost` sert le geste destructif qui est aussi TERTIAIRE — annuler une facture, sous
 * « Marquer payée » : il ne doit pas crier plus fort que l'action principale, et sa gravité
 * n'apparaît qu'à l'armement. `secondary` sert le geste RÉVERSIBLE, qu'on protège d'un
 * effleurement sans le peindre en rouge : rouvrir une facture payée se corrige.
 */
type CmvConfirmVariant = "danger" | "secondary" | "ghost";

const REST_CLASSES: Record<CmvConfirmVariant, string> = {
  danger: "border border-cmv-error",
  secondary: "border border-cmv-border-hi bg-cmv-surface-hi",
  ghost: "border border-cmv-border",
};

const REST_TEXT: Record<CmvConfirmVariant, string> = {
  danger: "text-cmv-error",
  secondary: "text-cmv-text-hi",
  ghost: "text-cmv-text-mid",
};

/**
 * L'armement révèle la gravité : `ghost` passe alors aux nuances d'état (`soft` / `line` / `on`),
 * jamais au DEFAULT en texte, qui ne passe pas AA sur nos fonds.
 */
const CONFIRM_CLASSES: Record<CmvConfirmVariant, string> = {
  danger: "bg-cmv-error",
  secondary: "border border-cmv-border-hi bg-cmv-surface-hi",
  ghost: "border border-cmv-error-line bg-cmv-error-soft",
};

const CONFIRM_TEXT: Record<CmvConfirmVariant, string> = {
  danger: "text-cmv-text-hi",
  secondary: "text-cmv-text-hi",
  ghost: "text-cmv-error-on",
};

type CmvConfirmButtonProps = {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  variant?: CmvConfirmVariant;
  /**
   * Ce que la confirmation engage, écrit UNE FOIS le bouton armé — parité avec le web. Au repos il
   * n'y a rien à avertir ; armé, c'est le dernier moment où le dire. Omis, le bouton se comporte
   * comme avant.
   */
  confirmHint?: string;
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
  variant = "danger",
  confirmHint,
}: Readonly<CmvConfirmButtonProps>) {
  const [armed, setArmed] = useState(false);
  const dimmed = disabled === true ? "opacity-50" : "";

  if (!armed) {
    return (
      <Pressable
        onPress={() => setArmed(true)}
        disabled={disabled}
        className={`rounded-lg px-4 py-3 ${REST_CLASSES[variant]} ${dimmed}`}
      >
        <CmvText className={`text-center ${REST_TEXT[variant]}`}>{label}</CmvText>
      </Pressable>
    );
  }

  return (
    <View className="gap-2">
      {/* Au-dessus des boutons, et non à côté : sur un téléphone, une phrase mise en ligne avec
          eux les écraserait tous les trois. */}
      {confirmHint == null ? null : (
        <CmvText className="text-cmv-text-mid text-sm">{confirmHint}</CmvText>
      )}
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => {
            setArmed(false);
            onConfirm();
          }}
          disabled={disabled}
          className={`flex-1 rounded-lg px-4 py-3 ${CONFIRM_CLASSES[variant]} ${dimmed}`}
        >
          <CmvText className={`text-center ${CONFIRM_TEXT[variant]}`}>{confirmLabel}</CmvText>
        </Pressable>
        <Pressable
          onPress={() => setArmed(false)}
          disabled={disabled}
          className={`flex-1 rounded-lg border border-cmv-border px-4 py-3 ${dimmed}`}
        >
          <CmvText className="text-center text-cmv-text-mid">{cancelLabel}</CmvText>
        </Pressable>
      </View>
    </View>
  );
}
