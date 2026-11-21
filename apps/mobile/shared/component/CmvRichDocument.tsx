import { type InlineNode, type RichBlock, RichBlockType, type RichDocument } from "@cmv/shared";
import { useNetworkState } from "expo-network";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Image, Linking, Text, View } from "react-native";
import { CmvText } from "@/shared/component/CmvText";

/**
 * Rendu NATIF d'une consigne structurée — le pendant React Native de `CmvRichDocument` côté web.
 *
 * Pas de WebView, pas de HTML : le modèle n'a pas de forme HTML, donc il n'y a rien à assainir
 * avant de l'afficher, et rien à charger pour le rendre. Les deux surfaces rendent les mêmes
 * blocs avec leurs propres primitives.
 */

const MARK_CLASSES = {
  BOLD: "font-semibold",
  ITALIC: "italic",
  UNDERLINE: "underline",
} as const;

function inlineClass(node: InlineNode): string {
  return (node.marks ?? []).map((mark) => MARK_CLASSES[mark]).join(" ");
}

/**
 * Un fragment inline. En React Native, un `Text` imbriqué hérite du style de son parent : c'est
 * ce qui permet de composer gras, italique et lien sans reconstruire la ligne.
 */
function Inline({ node }: Readonly<{ node: InlineNode }>) {
  const className = inlineClass(node);

  if (node.href == null) {
    return <Text className={className}>{node.text}</Text>;
  }
  return (
    <Text
      className={`text-cmv-accent underline ${className}`}
      onPress={() => Linking.openURL(node.href as string)}
    >
      {node.text}
    </Text>
  );
}

function inlineContent(nodes: readonly InlineNode[]) {
  // L'index sert de clé : deux fragments peuvent porter le même texte, et leur ORDRE est leur
  // seule identité — ils ne sont ni réordonnés ni filtrés après rendu.
  return nodes.map((node, index) => <Inline key={index} node={node} />);
}

/**
 * Où lire l'image d'un bloc, ou `null` quand son média est introuvable. C'est l'écran qui le sait —
 * URL signée, fichier descendu sur l'appareil — pas le design system.
 */
export type ResolveImage = (mediaId: string) => string | null;

function Block({
  block,
  resolveImage,
}: Readonly<{ block: RichBlock; resolveImage: ResolveImage | null }>) {
  if (block.type === RichBlockType.HEADING) {
    return (
      <CmvText className="font-cmv-display text-base text-cmv-text-hi">
        {inlineContent(block.content)}
      </CmvText>
    );
  }
  if (block.type === RichBlockType.PARAGRAPH) {
    return <CmvText className="text-cmv-text-mid">{inlineContent(block.content)}</CmvText>;
  }
  if (block.type === RichBlockType.CALLOUT) {
    return (
      <View className="rounded-l-md border-cmv-accent border-l-2 bg-cmv-surface py-1 pl-3">
        <CmvText className="text-cmv-text-mid">{inlineContent(block.content)}</CmvText>
      </View>
    );
  }
  if (block.type === RichBlockType.LIST) {
    return (
      <View className="gap-1 pl-3">
        {block.items.map((item, index) => (
          <CmvText key={index} className="text-cmv-text-mid">
            {block.ordered ? `${index + 1}. ` : "• "}
            {inlineContent(item)}
          </CmvText>
        ))}
      </View>
    );
  }
  // Média introuvable, ou écran sans images : rien. Pas de cadre cassé — la consigne se lit sans.
  const source = resolveImage?.(block.mediaId) ?? null;
  if (source == null) return null;
  // La clé est la SOURCE : chaque image a son propre état de chargement. Une URL re-signée ou un
  // fichier descendu repart de « loading » — c'est un vrai rechargement, le spinner dit vrai —
  // et l'échec de l'ancienne URL, ou le succès d'une autre image au même index, ne la suit pas.
  return <ImageBlock key={source} block={block} source={source} />;
}

/**
 * Une image de consigne. Elle porte son état de chargement : sur un téléphone en salle, le réseau
 * est lent ou absent, et une zone vide sans explication se lit comme un bug.
 *
 * L'échec DIT sa cause, et les deux ne se confondent pas : hors réseau l'image reviendra, en
 * ligne elle est perdue pour cette lecture (URL signée périmée, objet disparu). Annoncer
 * « hors ligne » à un athlète connecté l'enverrait vérifier sa connexion pour rien.
 */
function ImageBlock({
  block,
  source,
}: Readonly<{ block: Extract<RichBlock, { type: "IMAGE" }>; source: string }>) {
  const { t } = useTranslation();
  const network = useNetworkState();
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  return (
    <View className="gap-1">
      <View className="overflow-hidden rounded-lg bg-cmv-surface">
        <Image
          source={{ uri: source }}
          // `contain` et une hauteur fixe : sans dimension connue, React Native rendrait une image
          // de hauteur nulle. Pleine largeur du bloc, jamais habillée de texte.
          resizeMode="contain"
          className="h-56 w-full"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
        />
        {state === "loading" ? (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : null}
        {state === "failed" ? (
          <View className="absolute inset-0 items-center justify-center px-4">
            <CmvText className="text-center text-cmv-text-lo text-xs">
              {network.isInternetReachable === false
                ? t("common.imageOffline")
                : t("common.imageUnavailable")}
            </CmvText>
          </View>
        ) : null}
      </View>
      {block.caption == null || block.caption === "" ? null : (
        <CmvText className="text-cmv-text-lo text-xs">{block.caption}</CmvText>
      )}
    </View>
  );
}

type CmvRichDocumentProps = {
  blocks: RichDocument | null;
  /**
   * `null` = les images ne sont pas rendues, le texte reste lisible. Obligatoire et jamais
   * optionnel : un écran qui renonce aux images l'ÉCRIT, un écran qui l'oublie ne compile pas.
   */
  resolveImage: ResolveImage | null;
};

export function CmvRichDocument({ blocks, resolveImage }: Readonly<CmvRichDocumentProps>) {
  // Une consigne absente n'affiche RIEN — pas de « aucune consigne », qui serait du bruit sur une
  // absence légitime (règle nullable n°5).
  if (blocks == null || blocks.length === 0) return null;

  return (
    <View className="gap-2">
      {blocks.map((block, index) => (
        <Block key={index} block={block} resolveImage={resolveImage} />
      ))}
    </View>
  );
}
