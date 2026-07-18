import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Modal, Pressable, View } from "react-native";

type ImageMessageProps = {
  // URL GET signée (bucket privé), régénérée à chaque lecture.
  url: string;
};

/**
 * Image d'un message : vignette dans la bulle, ouverte en plein écran au tap (Modal in-app, pas
 * d'ouverture navigateur). Fermeture par tap n'importe où ou bouton retour (Android).
 */
export function ImageMessage({ url }: Readonly<ImageMessageProps>) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Pressable onPress={() => setExpanded(true)}>
        <Image source={{ uri: url }} className="h-48 w-48 rounded-xl" resizeMode="cover" />
      </Pressable>

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
      >
        <Pressable
          onPress={() => setExpanded(false)}
          className="flex-1 items-center justify-center bg-cmv-bg-0"
        >
          <Image source={{ uri: url }} className="h-full w-full" resizeMode="contain" />
          <View className="absolute top-12 right-4">
            <Ionicons name="close" size={30} color={cmvColors.text.hi} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
