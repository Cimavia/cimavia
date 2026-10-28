import {
  EXERCISE_MAX_TAGS,
  EXERCISE_TAG_MAX_LENGTH,
  STRUCTURE_INSTRUCTIONS_MAX_LENGTH,
  STRUCTURE_NAME_MAX_LENGTH,
  STRUCTURE_NOTE_MAX_LENGTH,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { StructureSettingsForm } from "@/feature/library/component/StructureSettingsForm";
import type { useStructureDraft } from "@/feature/library/hook/useStructureDraft";
import { CmvTagInput, CmvTextArea, CmvTextField } from "@/shared/component";

type StructureFieldsProps = {
  draft: ReturnType<typeof useStructureDraft>;
  /** Le nom manque ou est pris : ce que dit le champ, ou `null`. */
  nameError: string | null;
  onNameBlur: () => void;
  /** Les tags des structures du Coach, proposés à la saisie. */
  knownTags: readonly string[];
};

/**
 * Les champs d'une structure du Coach (#717) : nom, tags, note, consigne et réglages. La page d'une
 * structure et « Enregistrer comme structure » du constructeur de séance (#719) les partagent.
 */
export function StructureFields({
  draft,
  nameError,
  onNameBlur: touchTitle,
  knownTags,
}: Readonly<StructureFieldsProps>) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-col gap-cmv-xs">
        <CmvTextField
          label={t("library.structure.nameLabel")}
          name="name"
          maxLength={STRUCTURE_NAME_MAX_LENGTH}
          value={draft.name}
          onChange={(event) => draft.set("name", event.target.value)}
          onBlur={touchTitle}
          placeholder={t("library.structure.namePlaceholder")}
          required
          requiredMark
        />
        {nameError == null ? null : <p className="text-cmv-caption text-cmv-error">{nameError}</p>}
        <p className="text-cmv-caption text-cmv-text-lo">{t("common.requiredLegend")}</p>
      </div>

      <CmvTagInput
        label={t("library.tags.label")}
        maxLength={EXERCISE_TAG_MAX_LENGTH}
        value={draft.tags}
        onChange={(tags) => draft.set("tags", tags)}
        suggestions={knownTags}
        placeholder={t("library.tags.placeholder")}
        removeLabel={t("library.tags.remove")}
        max={EXERCISE_MAX_TAGS}
      />

      <div className="flex flex-col gap-cmv-xs">
        <CmvTextArea
          label={t("library.structure.noteLabel")}
          name="note"
          rows={2}
          maxLength={STRUCTURE_NOTE_MAX_LENGTH}
          value={draft.note}
          onChange={(event) => draft.set("note", event.target.value)}
          placeholder={t("library.structure.notePlaceholder")}
        />
        <p className="text-cmv-caption text-cmv-text-lo">{t("library.structure.noteHint")}</p>
      </div>

      <div className="flex flex-col gap-cmv-xs">
        <CmvTextArea
          label={t("library.structure.instructionsLabel")}
          name="instructions"
          rows={2}
          maxLength={STRUCTURE_INSTRUCTIONS_MAX_LENGTH}
          value={draft.instructions}
          onChange={(event) => draft.set("instructions", event.target.value)}
          placeholder={t("library.structure.instructionsPlaceholder")}
        />
        <p className="text-cmv-caption text-cmv-text-lo">
          {t("library.structure.instructionsHint")}
        </p>
      </div>

      <StructureSettingsForm
        settings={draft.settings}
        onChange={(settings) => draft.set("settings", settings)}
      />
    </>
  );
}

/** Le nom manque, ou il est déjà pris : ce que dit le champ, ou `null`. */
export function nameErrorOf(missing: boolean, takenBy: string | null, t: TFunction): string | null {
  if (missing) return t("library.structure.nameRequired");
  return takenBy == null ? null : t("library.structure.nameTaken", { name: takenBy });
}
