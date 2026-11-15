import type { TrainingCapability } from "@cmv/shared";
import { type ReactElement, useEffect } from "react";
import {
  ExercisedCapabilityProvider,
  useCapabilitySwitch,
  useExercisedCapability,
} from "@/shared/hook/useExercisedCapability";

/** Le sélecteur tel que Factures ou Messages l'a laissé, posé après le premier rendu. */
function SelectorLeftOn({ capability }: Readonly<{ capability: TrainingCapability }>) {
  const { select } = useCapabilitySwitch();
  useEffect(() => select(capability), [select, capability]);
  return null;
}

/** Le titre exercé hors de tout écran imposé : ce que Factures ou Messages lirait à l'arrivée. */
function ExercisedProbe() {
  return <span data-testid="exercised">{useExercisedCapability() ?? "null"}</span>;
}

/**
 * Monte `ui` sous le fournisseur de la racine, sélecteur laissé sur `capability` (#343), avec une
 * sonde `data-testid="exercised"` : de quoi vérifier qu'un écran d'un seul titre lit au sien, et
 * qu'il bascule le sélecteur avant d'ouvrir un écran servi aux deux.
 */
export function withSelectorOn(capability: TrainingCapability, ui: ReactElement): ReactElement {
  return (
    <ExercisedCapabilityProvider>
      <SelectorLeftOn capability={capability} />
      <ExercisedProbe />
      {ui}
    </ExercisedCapabilityProvider>
  );
}
