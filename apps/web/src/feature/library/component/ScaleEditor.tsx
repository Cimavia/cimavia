import {
  FRENCH_CLIMBING_SCALE,
  type OrderedScale,
  SCALE_MAX_STEPS,
  SCALE_STEP_MAX_LENGTH,
  V_BOULDERING_SCALE,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { CmvButton, CmvDragHandle } from "@/shared/component";

type ScaleEditorProps = {
  scale: OrderedScale;
  onChange: (scale: OrderedScale) => void;
};

/**
 * Les paliers d'une échelle ORDONNÉE. L'ordre n'est pas cosmétique : c'est lui qui rend possible
 * « progression sur l'échelle », et c'est la seule chose qui distingue une échelle d'une liste de
 * textes.
 *
 * Les deux cotations livrées sont DUPLICABLES, pas imposées : un coach qui travaille en salle
 * peut vouloir « facile / moyen / dur », et une échelle figée dans le code le lui interdirait.
 */
export function ScaleEditor({ scale, onChange }: Readonly<ScaleEditorProps>) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const isFull = scale.length >= SCALE_MAX_STEPS;

  function add() {
    const step = draft.trim();
    // Un doublon casserait `scaleStepIndex`, qui rend la PREMIÈRE position trouvée.
    if (step === "" || isFull || scale.includes(step)) return setDraft("");
    onChange([...scale, step]);
    setDraft("");
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= scale.length) return;
    const next = [...scale];
    const [moved] = next.splice(index, 1);
    if (moved == null) return;
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-cmv-xs">
      <span className="text-cmv-caption text-cmv-text-mid">{t("library.builder.scale.title")}</span>
      <span className="text-cmv-caption text-cmv-text-lo">{t("library.builder.scale.hint")}</span>

      <div className="flex flex-wrap gap-cmv-xs">
        <CmvButton variant="ghost" onClick={() => onChange([...FRENCH_CLIMBING_SCALE])}>
          {t("library.builder.scale.duplicateFrench")}
        </CmvButton>
        <CmvButton variant="ghost" onClick={() => onChange([...V_BOULDERING_SCALE])}>
          {t("library.builder.scale.duplicateV")}
        </CmvButton>
      </div>

      {scale.map((step, index) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: cible de dépôt du glisser-déposer — le chemin accessible est la poignée CmvDragHandle, qui répond aux flèches
        <div
          key={step}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (dragIndex != null) move(dragIndex, index);
            setDragIndex(null);
          }}
          className="flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-border bg-cmv-surface px-cmv-sm py-cmv-xs"
        >
          <CmvDragHandle
            label={`${t("library.builder.scale.moveStep")} ${index + 1}`}
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => setDragIndex(null)}
            onMove={(direction) => move(index, index + direction)}
          />
          <span className="w-6 text-cmv-caption text-cmv-text-lo">{index + 1}</span>
          <span className="flex-1 text-cmv-body text-cmv-text-hi">{step}</span>
          <CmvButton
            variant="ghost"
            title={t("library.builder.scale.removeStep")}
            onClick={() => onChange(scale.filter((current) => current !== step))}
          >
            <IoTrashOutline />
          </CmvButton>
        </div>
      ))}

      <div className="flex items-center gap-cmv-xs">
        <input
          value={draft}
          maxLength={SCALE_STEP_MAX_LENGTH}
          disabled={isFull}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            add();
          }}
          placeholder={t("library.builder.scale.stepPlaceholder")}
          aria-label={t("library.builder.scale.stepLabel")}
          className="flex-1 rounded-cmv-sm border border-cmv-border bg-cmv-bg-1 px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
        />
        <CmvButton variant="secondary" onClick={add} disabled={draft.trim() === "" || isFull}>
          {t("library.builder.scale.addStep")}
        </CmvButton>
      </div>
    </div>
  );
}
