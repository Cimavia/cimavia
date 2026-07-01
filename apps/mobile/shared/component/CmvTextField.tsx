import { Text, TextInput, type TextInputProps, View } from "react-native";

type CmvTextFieldProps = Pick<
  TextInputProps,
  "value" | "onChangeText" | "secureTextEntry" | "autoCapitalize" | "keyboardType" | "autoComplete"
> & { label: string };

export function CmvTextField({ label, ...rest }: CmvTextFieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-cmv-text-mid text-sm">{label}</Text>
      <TextInput
        className="rounded-lg border border-cmv-border bg-cmv-surface px-3 py-3 text-cmv-text-hi"
        {...rest}
      />
    </View>
  );
}
