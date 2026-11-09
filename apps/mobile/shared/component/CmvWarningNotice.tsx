import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { CmvText } from "./CmvText";

/** Ce qu'on s'apprête à perdre, en couleurs d'avertissement : pas une simple note d'information. */
export function CmvWarningNotice({ children }: Readonly<{ children: string }>) {
  return (
    <View className="flex-row items-center gap-2 rounded-lg border border-cmv-warning-line bg-cmv-warning-soft p-3">
      <Ionicons name="warning-outline" size={18} color={cmvColors.warning.on} />
      <CmvText className="flex-1 text-cmv-warning-on text-sm">{children}</CmvText>
    </View>
  );
}
