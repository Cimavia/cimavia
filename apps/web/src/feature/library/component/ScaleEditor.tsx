import {
  FRENCH_CLIMBING_SCALE,
  type OrderedScale,
  SCALE_MAX_STEPS,
  SCALE_STEP_MAX_LENGTH,
  V_BOULDERING_SCALE,
} from "@cmv/shared";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoTrashOutline } from "react-icons/io5";
import { CmvButton, CmvDragHandle } from "@/shared/component";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { cn } from "@/shared/util/cn.util";

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
  const inputRef = useRef<HTMLInputElement>(null);

  const isFull = scale.length >= SCALE_MAX_STEPS;
  const drag = useReorderDrag(move);

  function add() {
    const step = draft.trim();
    // Un doublon casserait `scaleStepIndex`, qui rend la PREMIÈRE position trouvée.
    if (step === "" || isFull || scale.includes(step)) return setDraft("");
    onChange([...scale, step]);
    setDraft("");
    // Le focus revient au champ : on saisit une échelle palier après palier, et devoir recliquer
    // entre chacun rendrait le bouton inutilisable au clavier comme à la souris.
    inputRef.current?.focus();
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
        <div
          key={step}
          {...drag.rowProps(index)}
          className={cn(
            "flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-border px-cmv-sm py-cmv-xs",
            drag.isDragging(index) && "opacity-40",
            drag.isOver(index) ? "bg-cmv-accent-soft" : "bg-cmv-surface",
          )}
        >
          <CmvDragHandle
            label={`${t("library.builder.scale.moveStep")} ${index + 1}`}
            {...drag.handleProps(index)}
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
          ref={inputRef}
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
