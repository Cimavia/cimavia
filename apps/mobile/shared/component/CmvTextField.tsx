import { cmvColors } from "@cmv/tokens";
import { useId, useRef } from "react";
import { Platform, Text, TextInput, type TextInputProps, View } from "react-native";
import { CmvCharCount } from "./CmvCharCount";

type CmvTextFieldProps = Pick<
  TextInputProps,
  | "value"
  | "onChangeText"
  | "secureTextEntry"
  | "autoCapitalize"
  | "keyboardType"
  | "autoComplete"
  | "placeholder"
  | "multiline"
  | "maxLength"
  | "editable"
  | "returnKeyType"
  | "onSubmitEditing"
> & { label: string };

// Une zone multiligne bornée montre son compteur à l'approche de la borne (#319). Pas un champ
// d'une ligne : ses bornes (titre, e-mail) ne s'atteignent pas en pratique.
export function CmvTextField({ label, multiline, ...rest }: CmvTextFieldProps) {
  const { value, maxLength } = rest;
  const input = useRef<TextInput>(null);
  const labelId = useId();
  return (
    <View className="gap-1">
      {/* Un appui sur le libellé met le curseur dans le champ, comme un `<label>` : la cible
          s'agrandit, et c'est par lui que les parcours Maestro (#638) trouvent le champ. */}
      <Text
        nativeID={labelId}
        onPress={() => input.current?.focus()}
        className="text-cmv-text-mid text-sm"
      >
        {label}
      </Text>
      <TextInput
        ref={input}
        // Le champ est NOMMÉ par son libellé — sans quoi un lecteur d'écran annonce « zone
        // d'édition » sans dire laquelle. Sur Android, par le lien (`labelFor`) et pas par un
        // `contentDescription` : posé sur un champ, TalkBack le lirait À LA PLACE de la valeur
        // saisie. iOS n'a pas de lien : VoiceOver lit le label, puis la valeur.
        aria-labelledby={labelId}
        accessibilityLabel={Platform.OS === "ios" ? label : undefined}
        multiline={multiline}
        // Un champ multiligne doit laisser le texte partir du HAUT : sinon, sur Android, le
        // débrief s'écrit centré verticalement dans la boîte.
        textAlignVertical={multiline === true ? "top" : "center"}
        placeholderTextColor={cmvColors.text.lo}
        className={`rounded-lg border border-cmv-border bg-cmv-surface px-3 py-3 text-cmv-text-hi ${
          multiline === true ? "min-h-32" : ""
        }`}
        {...rest}
      />
      {multiline === true && maxLength !== undefined ? (
        <CmvCharCount length={value?.length ?? 0} maxLength={maxLength} />
      ) : null}
    </View>
  );
}
