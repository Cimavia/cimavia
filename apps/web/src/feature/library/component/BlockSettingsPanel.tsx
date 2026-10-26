import {
  exerciseOrderShown,
  isCustomized,
  roundsError,
  SESSION_BLOCK_LABEL_MAX_LENGTH,
  type SessionBlock,
  STRUCTURE_INSTRUCTIONS_MAX_LENGTH,
  StructureOrder,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StructureSettingsForm } from "@/feature/library/component/StructureSettingsForm";
import { CmvButton, CmvPanel, CmvSegmented, CmvTextArea, CmvTextField } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

type BlockSettingsPanelProps = {
  block: SessionBlock;
  /** « A », ou `null` pour un bloc à libellé : le titre du panneau le nomme. */
  letter: string | null;
  onApply: (block: SessionBlock) => void;
  onClose: () => void;
};

/**
 * Les réglages d'UN bloc (#719, maquette `coach_constructeur_seance_v2`, frame 3 quater) : son
 * libellé, les réponses de sa structure et leurs valeurs, l'ordre de ses exercices et la consigne
 * de l'athlète. Rien ne touche la structure de la bibliothèque : le bloc en est une copie.
 *
 * Le panneau travaille sur sa propre copie, que « Appliquer au bloc » pose d'un geste : fermer sans
 * appliquer ne change rien.
 */
export function BlockSettingsPanel({
  block,
  letter,
  onApply,
  onClose,
}: Readonly<BlockSettingsPanelProps>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const [label, setLabel] = useState(block.label ?? "");
  const [instructions, setInstructions] = useState(block.instructions ?? "");
  const [settings, setSettings] = useState(block.settings);
  const count = block.exercises.length;

  const customized = isCustomized(settings, block.copiedSettings);
  const error = roundsError(settings, count);
  // Revenir aux réglages copiés ne doit pas poser un bloc que l'enregistrement refuserait.
  const revertBlocked = roundsError(block.copiedSettings, count) != null;

  function apply() {
    onApply({
      ...block,
      label: label.trim() === "" ? null : label.trim(),
      instructions: instructions.trim() === "" ? null : instructions,
      settings,
    });
    onClose();
  }

  return (
    <CmvPanel
      open
      title={
        letter == null
          ? t("library.session.blocks.settingsOfLabel", { label: block.label })
          : t("library.session.blocks.settingsOf", { letter })
      }
      description={t("library.session.blocks.settingsHint")}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-cmv-sm">
          <CmvButton
            variant="ghost"
            disabled={!customized || revertBlocked}
            onClick={() => setSettings(block.copiedSettings)}
          >
            {t("library.session.blocks.revertTo", { name: block.name })}
          </CmvButton>
          <div className="flex gap-cmv-sm">
            <CmvButton variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </CmvButton>
            <CmvButton onClick={apply}>{t("library.session.blocks.apply")}</CmvButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-cmv-xl">
        <p className="text-cmv-caption text-cmv-text-mid">
          {customized
            ? t("library.session.blocks.customizedFrom", { name: block.name })
            : block.name}
        </p>
        <CmvTextField
          label={t("library.session.blocks.label")}
          name="block-label"
          maxLength={SESSION_BLOCK_LABEL_MAX_LENGTH}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t("library.session.blocks.labelPlaceholder")}
        />
        <StructureSettingsForm settings={settings} onChange={setSettings} />
        {exerciseOrderShown(settings, count) ? (
          <CmvSegmented
            label={t("library.session.blocks.order")}
            options={[
              { value: StructureOrder.ALL, label: t("library.session.blocks.orderAll") },
              { value: StructureOrder.ONE, label: t("library.session.blocks.orderOne") },
            ]}
            value={settings.order}
            onChange={(order) => setSettings({ ...settings, order })}
          />
        ) : null}
        {error == null ? null : (
          <p role="alert" className="text-cmv-caption text-cmv-error-on">
            {text([error])}
          </p>
        )}
        <CmvTextArea
          label={t("library.session.blocks.instructions")}
          name="block-instructions"
          rows={3}
          maxLength={STRUCTURE_INSTRUCTIONS_MAX_LENGTH}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder={t("library.session.blocks.instructionsPlaceholder")}
        />
      </div>
    </CmvPanel>
  );
}
