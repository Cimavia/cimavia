import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Modal, Pressable, View } from "react-native";

type CmvImageViewerProps = {
  // URL GET signée (bucket privé), régénérée à chaque lecture.
  url: string;
  // Cadrage de la VIGNETTE (bulle de message, tuile de grille, bloc pleine largeur). Le plein
  // écran, lui, ne varie pas : une photo agrandie se regarde de la même façon partout.
  containerClassName?: string;
};

/**
 * Une photo : vignette au repos, plein écran au tap (Modal in-app, pas d'ouverture navigateur).
 * Fermeture par tap n'importe où ou bouton retour (Android).
 *
 * Partagé messagerie ET débrief. Il ne servait que la messagerie jusqu'ici, ce qui laissait les
 * photos de débrief inagrandissables sur mobile alors que le web les ouvre en pleine taille —
 * un écart de parité pour un composant qui existait déjà à trois fichiers de là.
 */
export function CmvImageViewer({
  url,
  containerClassName = "h-48 w-48 overflow-hidden rounded-xl",
}: Readonly<CmvImageViewerProps>) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Pressable onPress={() => setExpanded(true)} className={containerClassName}>
        <Image source={{ uri: url }} className="h-full w-full" resizeMode="cover" />
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
          {/* `contain` et non `cover` : agrandir sert à VOIR le geste, un recadrage rognerait
              justement ce qu'on cherche à regarder. */}
          <Image source={{ uri: url }} className="h-full w-full" resizeMode="contain" />
          <View className="absolute top-12 right-4">
            <Ionicons name="close" size={30} color={cmvColors.text.hi} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
