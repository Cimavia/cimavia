import type { ExerciseBlocks, RichDocument } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvCard, CmvRichDocument, CmvTagList, type ResolveImage } from "@/shared/component";

type ExercisePreviewProps = {
  title: string;
  tags: readonly string[];
  instructions: RichDocument;
  blocks: ExerciseBlocks;
  resolveImage: ResolveImage;
};

/**
 * Ce que l'athlète verra, mis à jour à la frappe. **Lecture seule** : ni timer ni case à cocher
 * n'y sont paramétrables, ils découlent des valeurs saisies dans la structure. Rien ici ne doit
 * ressembler à un réglage.
 *
 * Tant qu'il n'y a pas de titre, l'aperçu ne montre pas une carte vide : il dit ce qu'il attend.
 */
// i18n-values library.builder.blockType: BlockType
export function ExercisePreview({
  title,
  tags,
  instructions,
  blocks,
  resolveImage,
}: Readonly<ExercisePreviewProps>) {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.previewTitle")}
      </span>

      {title === "" ? (
        <p className="rounded-cmv-md border border-cmv-border border-dashed bg-cmv-bg-1 p-cmv-lg text-center text-cmv-caption text-cmv-text-mid">
          {t("library.builder.previewEmpty")}
        </p>
      ) : (
        <CmvCard className="flex flex-col gap-cmv-sm">
          <h3 className="text-cmv-subtitle text-cmv-text-hi">{title}</h3>
          <CmvTagList tags={tags} />
          <CmvRichDocument blocks={instructions} resolveImage={resolveImage} />

          {/* Un exercice SANS aucun bloc est légitime — « étirements au ressenti ». L'athlète
              voit alors titre et consigne, rien d'autre : pas de grille vide, pas de phrase de
              dosage. La phrase complète arrive avec la grille. */}
          {blocks.map((block) => (
            <p key={block.id} className="text-cmv-caption text-cmv-text-mid">
              {block.label ?? t(`library.builder.blockType.${block.structure.type}`)}
            </p>
          ))}
        </CmvCard>
      )}
    </section>
  );
}
