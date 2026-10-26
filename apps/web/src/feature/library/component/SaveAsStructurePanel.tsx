import { blockStructureInput, type SessionBlock, type StructureDto } from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { nameErrorOf, StructureFields } from "@/feature/library/component/StructureFields";
import { useBuilderSave } from "@/feature/library/hook/useBuilderSave";
import { useStructureDraft } from "@/feature/library/hook/useStructureDraft";
import { useStructureLibrary } from "@/feature/library/hook/useStructures";
import { CmvButton, CmvPanel } from "@/shared/component";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";

type SaveAsStructurePanelProps = {
  block: SessionBlock;
  /** « le bloc A de Force & conditionnement » : d'où part la structure. */
  origin: string;
  onCreated: (structure: StructureDto) => void;
  onClose: () => void;
};

/**
 * « Enregistrer comme structure » (#719, frame 3 ter) : le formulaire de la bibliothèque, prérempli
 * des réglages et de la consigne du bloc, le nom vide. Dans un panneau plutôt qu'en pleine page :
 * la séance en cours reste ouverte derrière, sa saisie avec.
 */
export function SaveAsStructurePanel({
  block,
  origin,
  onCreated,
  onClose,
}: Readonly<SaveAsStructurePanelProps>) {
  const { t } = useTranslation();
  const { data: library } = useStructureLibrary();
  const draft = useStructureDraft(null, blockStructureInput(block, ""));
  // Une durée refusée dans le panneau retient SON enregistrement, pas celui de la séance.
  const refused = useRefusedFields();
  const { blockedBy, titleMissing, touchTitle, save } = useBuilderSave(draft, refused.hasRefused, {
    titleRequired: "library.structure.nameRequired",
    saveFailed: "library.structure.saveFailed",
  });
  const knownTags = [...new Set((library?.structures ?? []).flatMap((item) => item.tags))];

  async function onSubmit() {
    const created = await save("library.structure.saved");
    if (created == null) return;
    onCreated(created);
    onClose();
  }

  return (
    <CmvPanel
      open
      title={t("library.structure.createTitle")}
      description={t("library.session.blocks.saveAsFrom", { origin })}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-cmv-sm">
          <CmvButton variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </CmvButton>
          <CmvButton
            onClick={onSubmit}
            disabled={draft.isSaving || draft.trimmedTitle === "" || blockedBy != null}
            title={blockedBy}
          >
            {submitLabel(draft.isSaving, t)}
          </CmvButton>
        </div>
      }
    >
      <RefusedFieldsContext value={refused.report}>
        <div className="flex flex-col gap-cmv-xl">
          <StructureFields
            draft={draft}
            nameError={nameErrorOf(titleMissing, draft.takenBy, t)}
            onNameBlur={touchTitle}
            knownTags={knownTags}
          />
        </div>
      </RefusedFieldsContext>
    </CmvPanel>
  );
}

function submitLabel(isSaving: boolean, t: TFunction): string {
  return t(isSaving ? "library.builder.saving" : "library.structure.submitCreate");
}
