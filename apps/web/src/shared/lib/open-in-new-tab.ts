/**
 * Ce qu'est devenu l'onglet. `blocked` et `failed` se disent différemment : réessayer ne sert à
 * rien tant que le navigateur refuse les fenêtres. `closed` est l'onglet que l'utilisateur a
 * refermé pendant l'attente — il n'y a rien à lui dire, c'est son geste.
 */
export type OpenInNewTabOutcome = "opened" | "closed" | "blocked" | "failed";

/**
 * Ouvre dans un nouvel onglet une URL qu'il faut d'abord obtenir — une URL signée à re-signer.
 *
 * L'onglet s'ouvre DANS le geste, vide, et ne reçoit son adresse qu'ensuite. Ouvert après
 * l'attente, Safari et Firefox le prendraient pour une fenêtre surgissante et le bloqueraient : le
 * clic aurait l'air de ne rien faire.
 *
 * Pas de `noopener` à l'ouverture — `window.open` rendrait alors `null`, sans onglet à diriger —
 * mais le lien vers cette page est coupé avant la navigation : la page ouverte ne peut pas la
 * rediriger.
 *
 * Sur une URL introuvable, l'onglet vide est refermé : c'est à l'appelant de dire l'échec.
 */
export async function openInNewTab(
  resolveUrl: () => Promise<string | null>,
): Promise<OpenInNewTabOutcome> {
  const tab = window.open("", "_blank");
  // Refusé par le navigateur : pas la peine de re-signer une URL qui n'aura nulle part où aller.
  if (tab == null) return "blocked";

  const url = await resolveUrl().catch(() => null);
  if (tab.closed) return "closed";
  if (url == null) {
    tab.close();
    return "failed";
  }
  tab.opener = null;
  tab.location.href = url;
  return "opened";
}
