import type { CapabilityName } from "../capability";

/**
 * Le paramètre par lequel un appel dit **à quel titre** il est fait — `coach` ou `athlete` (#10).
 *
 * Les routes servant les deux capacités (`/invoices`, `/conversations`, messages) ne peuvent pas
 * deviner quel scope appliquer à un compte qui les cumule : le coach voit ce qu'il a émis,
 * l'athlète ce qu'il a reçu, et répondre l'un par convention laisserait croire qu'on voit tout.
 * L'API répond donc **400** à un compte à double capacité qui ne précise rien.
 *
 * Un compte mono-capacité n'a rien à envoyer — sa capacité est la seule réponse possible côté API.
 * C'est ce qui permet de passer `null` partout sans rien casser.
 */
export const AS_CAPABILITY_PARAM = "as";

/** Le suffixe d'URL, ou rien. Sortie vide sur `null` : voir `AS_CAPABILITY_PARAM`. */
export function asQuery(as: CapabilityName | null | undefined): string {
  return as == null ? "" : `?${AS_CAPABILITY_PARAM}=${as}`;
}

/**
 * Le fragment de clé de cache correspondant. Il n'est PAS optionnel dans les clés qui l'acceptent,
 * et c'est le point : deux titres lisent la même URL et rendent des listes différentes. Une clé
 * qui les confondrait servirait à l'un le cache de l'autre — un compte à double capacité verrait
 * ses factures reçues sous l'onglet de ses factures émises.
 */
export function asKey(as: CapabilityName | null | undefined): CapabilityName | null {
  return as ?? null;
}
