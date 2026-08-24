import { Node } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { useInstructionMediaContext } from "@/feature/library/component/InstructionMediaContext";
import { IMAGE_NODE } from "@/feature/library/util/tiptap-document.util";

/**
 * Le bloc image de la consigne. `atom: true` : son contenu n'est pas éditable au clavier — la
 * légende passe par un champ dédié dans la vue de nœud, pas par le curseur de l'éditeur.
 *
 * L'attribut est un `mediaId`, JAMAIS une URL (règle dure n°7) : les URLs S3 sont signées et
 * expirent, une consigne relue trois mois plus tard afficherait des images mortes.
 *
 * Pas de `parseHTML` : ce nœud ne peut pas naître d'un collage. Une image collée depuis le web
 * porterait une URL externe, qu'on refuse — le fichier doit passer par notre stockage.
 */
export const ImageExtension = Node.create({
  name: IMAGE_NODE,
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      mediaId: { default: "" },
      caption: { default: "" },
    };
  },

  renderHTML() {
    return ["figure", { "data-instruction-image": "" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InstructionImageView);
  },
});

function InstructionImageView({ node, updateAttributes, deleteNode }: Readonly<NodeViewProps>) {
  const { t } = useTranslation();
  const media = useInstructionMediaContext();

  const mediaId = String(node.attrs.mediaId ?? "");
  const caption = String(node.attrs.caption ?? "");
  const src = media.resolve(mediaId);
  const percent = media.progress[mediaId];

  return (
    <NodeViewWrapper className="my-cmv-sm">
      <figure className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-sm">
        <div className="relative">
          {src == null ? (
            <div className="flex h-32 items-center justify-center rounded-cmv-sm bg-cmv-surface text-cmv-caption text-cmv-text-mid">
              {t("library.builder.image.missing")}
            </div>
          ) : (
            <img src={src} alt={caption} className="w-full rounded-cmv-sm" />
          )}

          {/* État « 2 · Envoi » : visible seulement pendant l'enregistrement. */}
          {percent == null || percent >= 100 ? null : (
            <div className="absolute inset-0 flex items-center justify-center rounded-cmv-sm bg-cmv-bg-0/70 text-cmv-body text-cmv-text-hi">
              {t("library.builder.image.uploading", { percent })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-cmv-xs">
          <input
            value={caption}
            onChange={(event) => updateAttributes({ caption: event.target.value })}
            placeholder={t("library.builder.image.captionPlaceholder")}
            aria-label={t("library.builder.image.caption")}
            className="flex-1 bg-transparent text-cmv-caption text-cmv-text-mid outline-none placeholder:text-cmv-text-lo"
          />
          <button
            type="button"
            onClick={deleteNode}
            aria-label={t("library.builder.image.remove")}
            title={t("library.builder.image.remove")}
            className="rounded-cmv-sm px-cmv-xs py-cmv-xs text-cmv-text-mid hover:text-cmv-error"
          >
            <IoTrashOutline />
          </button>
        </div>
      </figure>
    </NodeViewWrapper>
  );
}
