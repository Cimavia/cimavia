import { Pressable, Text } from "react-native";

type CmvButtonVariant = "primary" | "danger";

const VARIANT_CLASSES: Record<CmvButtonVariant, string> = {
  primary: "bg-cmv-accent",
  danger: "bg-cmv-error",
};

type CmvButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `danger` : un geste qu'on ne rattrape pas, déjà confirmé par ailleurs (mot de passe). */
  variant?: CmvButtonVariant;
};

export function CmvButton({
  label,
  onPress,
  disabled,
  variant = "primary",
}: Readonly<CmvButtonProps>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`w-full rounded-lg px-4 py-3 ${VARIANT_CLASSES[variant]} ${disabled === true ? "opacity-50" : ""}`}
    >
      <Text className="text-center text-cmv-text-hi">{label}</Text>
    </Pressable>
  );
}
