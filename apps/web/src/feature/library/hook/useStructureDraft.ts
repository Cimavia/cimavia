import { type StructureDto, type StructureInput, sameJson, takenStructureName } from "@cmv/shared";
import { useState } from "react";
import {
  type StructureVersion,
  useSaveStructure,
  useStructureLibrary,
} from "@/feature/library/hook/useStructures";
import { isStaleWriteError } from "@/shared/lib/api";

/** Ce que le formulaire saisit, avant d'être mis sous la forme qui part. */
type StructureFields = Omit<StructureInput, "note" | "instructions"> & {
  note: string;
  instructions: string;
};

/** Un texte facultatif vide ne s'enregistre pas : il part à `null`, comme rien. */
function toInput(fields: StructureFields): StructureInput {
  return {
    name: fields.name.trim(),
    tags: fields.tags,
    note: fields.note.trim() === "" ? null : fields.note,
    instructions: fields.instructions.trim() === "" ? null : fields.instructions,
    settings: fields.settings,
  };
}

function fieldsOf(input: StructureInput): StructureFields {
  return { ...input, note: input.note ?? "", instructions: input.instructions ?? "" };
}

/**
 * Tout l'état du formulaire d'une structure (#717), et le seul geste qui l'écrit. Comme celui d'un
 * exercice, il naît de la structure chargée — ou de `start` pour une création — et n'y retourne
 * pas : l'écran le remonte (par sa `key`) quand la structure change.
 */
export function useStructureDraft(structure: StructureDto | null, start: StructureInput) {
  const save = useSaveStructure();
  const { data: library } = useStructureLibrary();

  /**
   * La version que le prochain enregistrement cite (#604) : figée à l'ouverture, elle n'avance
   * qu'avec NOS écritures — comme pour un exercice.
   */
  const [edited, setEdited] = useState<StructureVersion | null>(structure);
  const [fields, setFields] = useState(() => fieldsOf(structure ?? start));
  // Une copie ouverte puis quittée ne perd rien : sa source reste. Son nom proposé n'est pas une
  // saisie, comme le titre pré-rempli d'un exercice.
  const [saved, setSaved] = useState(() => toInput(fieldsOf(structure ?? start)));
  const input = toInput(fields);

  // La liste peut dater : une structure créée dans un autre onglet n'y est pas encore. Le refus de
  // l'API la fait relire avant de rendre l'échec (`useSaveStructure`) — elle seule décide donc.
  const takenBy = takenStructureName(input.name, library?.structures ?? [], edited?.id ?? null);

  async function submit(): Promise<StructureDto> {
    const result = await save.mutateAsync({ structure: edited, input });
    setSaved(input);
    setEdited(result);
    return result;
  }

  return {
    ...fields,
    set: <K extends keyof StructureFields>(key: K, value: StructureFields[K]) =>
      setFields((current) => ({ ...current, [key]: value })),
    trimmedTitle: input.name,
    /** Le nom de la structure qui porte déjà celui saisi, à citer ; `null` quand il est libre. */
    takenBy,
    refusal: takenBy == null ? null : "library.structure.nameTakenSave",
    submit,
    /** L'écran montre autre chose que l'enregistré : le quitter perdrait la saisie (#327). */
    isDirty: !sameJson(input, saved),
    isSaving: save.isPending,
    /** La structure a changé pendant la saisie (#604) : l'écran le dit, et propose de recharger. */
    isStale: isStaleWriteError(save.error),
  };
}
