import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparaison de secrets, en temps constant.
 *
 * Deux appelants s'en servent pour des raisons différentes — le déclencheur de rappels (#47)
 * compare un en-tête à un secret d'environnement, l'enregistrement d'un appareil push (#90)
 * compare un secret d'installation à son empreinte en base. Ce qu'ils partagent est la seule
 * chose délicate : ne rien divulguer par le TEMPS de réponse.
 */

/** Empreinte d'un secret, telle qu'on la stocke : le clair ne doit jamais survivre en base. */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Compare en temps constant, après hachage. Le hachage n'est pas là pour protéger les entrées —
 * elles peuvent déjà être des empreintes — mais pour les ramener à la MÊME longueur :
 * `timingSafeEqual` lève sur des tampons de tailles différentes, et faire précéder l'appel d'un
 * `length ===` divulguerait la longueur attendue par le temps de réponse.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
