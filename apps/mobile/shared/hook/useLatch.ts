import { useEffect, useState } from "react";

/**
 * Vrai dès que `value` l'a été une fois pour cette `key`, et le reste ensuite (#911) — même si
 * `value` retombe. C'est ce qu'il faut à un écran qui attend une lecture avant d'offrir un champ :
 * TanStack repasse une requête sans donnée en `pending` à chaque relance (retour au premier plan,
 * réseau revenu, invalidation), et l'attente reprendrait, démontant le champ et sa frappe.
 *
 * La `key` remet le verrou à zéro : une autre séance, un autre athlète, attendent leur propre
 * lecture.
 */
export function useLatch(key: string, value: boolean): boolean {
  const [latchedKey, setLatchedKey] = useState<string | null>(null);
  useEffect(() => {
    if (value) setLatchedKey(key);
  }, [key, value]);
  return value || latchedKey === key;
}
