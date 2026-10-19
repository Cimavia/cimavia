import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/shared/component";
import { useCheckedSave } from "@/shared/hook/useCheckedSave";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { isStaleWriteError } from "@/shared/lib/api";

/** Ce qu'un constructeur enregistre : un titre, obligatoire, et l'envoi du brouillon. */
type SavableDraft<Saved> = { trimmedTitle: string; submit: () => Promise<Saved> };

/** Les textes propres au constructeur : le titre manquant, l'échec de l'enregistrement. */
type BuilderSaveKeys = { titleRequired: string; saveFailed: string };

/**
 * L'enregistrement d'un constructeur de la bibliothèque — exercice ou séance —, et ce qui le
 * retient : le titre manquant, ou une saisie refusée (#566).
 *
 * Plusieurs gestes enregistrent sans passer par le bouton, qui, lui, reste fermé sans titre :
 * « Enregistrer » du dialogue de sortie (#682), et pour la séance « Dupliquer en variante » et
 * « Créer l'exercice manquant » (#303). Sans titre, rien ne part : le champ le réclame et un toast
 * dit pourquoi, plutôt qu'un échec du serveur qui ne le dirait pas. Une saisie refusée retient de
 * même : l'enregistrement enverrait l'ANCIENNE valeur, et le coach partirait en la croyant gardée.
 *
 * `titleMissing` : le titre est vide ET réclamé — au départ du champ, ou par un geste qui enregistre.
 * Pas avant : le message accueillerait le coach par une erreur qu'il n'a pas encore pu commettre.
 */
export function useBuilderSave<Saved>(
  draft: SavableDraft<Saved>,
  hasRefused: boolean,
  keys: BuilderSaveKeys,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const { onFailure } = useMutationToast();
  const [titleTouched, setTitleTouched] = useState(false);

  /** Ce qui retient l'enregistrement — le titre manquant, que le champ réclame alors —, ou `null`. */
  function blocker(): string | null {
    if (draft.trimmedTitle === "") {
      setTitleTouched(true);
      return keys.titleRequired;
    }
    return hasRefused ? "library.builder.refusedBlocksSave" : null;
  }

  /** Le titre manque ou une saisie est refusée : rien ne s'enregistrerait, et le coach l'apprend. */
  function cannotSave(): boolean {
    const blocked = blocker();
    if (blocked != null) toast.error(t(blocked));
    return blocked != null;
  }

  /**
   * Enregistre, le dit, et rend ce qui est enregistré — ou `null` quand il faut rester : saisie
   * qui ne peut pas partir, échec (déjà annoncé), ou envoi déjà en vol (`useCheckedSave`).
   */
  const save = useCheckedSave(
    blocker,
    async (successKey: string) => {
      const saved = await draft.submit();
      toast.success(t(successKey));
      return saved;
    },
    // Un conflit d'édition se dit par le bandeau, à côté de la saisie : un toast disparaîtrait en
    // emportant la seule explication.
    (error) => {
      if (!isStaleWriteError(error)) onFailure(keys.saveFailed, error);
    },
  );

  return {
    titleMissing: titleTouched && draft.trimmedTitle === "",
    touchTitle: () => setTitleTouched(true),
    cannotSave,
    save,
  };
}
