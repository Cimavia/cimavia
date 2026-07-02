import { Text, type TextProps } from "react-native";

type CmvTextProps = Pick<TextProps, "children" | "numberOfLines" | "testID"> & {
  className?: string;
};

export function CmvText({ children, className = "", ...rest }: CmvTextProps) {
  return (
    <Text className={className} {...rest}>
      {children}
    </Text>
  );
}
