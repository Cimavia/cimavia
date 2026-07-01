import { Pressable, Text } from "react-native";

type CmvButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function CmvButton({ label, onPress, disabled }: CmvButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`w-full rounded-lg bg-cmv-accent px-4 py-3 ${disabled === true ? "opacity-50" : ""}`}
    >
      <Text className="text-center text-cmv-text-hi">{label}</Text>
    </Pressable>
  );
}
