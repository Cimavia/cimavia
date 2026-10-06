import { cmvColors } from "@cmv/tokens";
import { Text, TextInput, type TextInputProps, View } from "react-native";
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
  return (
    <View className="gap-1">
      <Text className="text-cmv-text-mid text-sm">{label}</Text>
      <TextInput
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
