import { Text, TextInput, type TextInputProps, View } from "react-native";

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
> & { label: string };

export function CmvTextField({ label, multiline, ...rest }: CmvTextFieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-cmv-text-mid text-sm">{label}</Text>
      <TextInput
        multiline={multiline}
        // Un champ multiligne doit laisser le texte partir du HAUT : sinon, sur Android, le
        // débrief s'écrit centré verticalement dans la boîte.
        textAlignVertical={multiline === true ? "top" : "center"}
        className={`rounded-lg border border-cmv-border bg-cmv-surface px-3 py-3 text-cmv-text-hi ${
          multiline === true ? "min-h-32" : ""
        }`}
        {...rest}
      />
    </View>
  );
}
