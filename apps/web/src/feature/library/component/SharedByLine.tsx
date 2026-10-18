import type { MyAccess } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { sharedByText } from "@/feature/library/util/access-text.util";

type SharedByLineProps = {
  owner: string;
  /** `null` pour l'athlète, qui n'a pas de droit sur ce qu'on lui adresse. */
  myAccess: MyAccess | null;
};

/**
 * « Partagé par M · Lecture via F », sous un élément d'une liste qui n'est pas à l'acteur (#607).
 * Rien sous les siens : « Moi » répété à chaque ligne noierait les quelques-unes qui comptent.
 */
export function SharedByLine({ owner, myAccess }: Readonly<SharedByLineProps>) {
  const { t } = useTranslation();
  const text = sharedByText(owner, myAccess, t);
  if (text == null) return null;
  return <span className="truncate text-cmv-caption text-cmv-text-lo">{text}</span>;
}
