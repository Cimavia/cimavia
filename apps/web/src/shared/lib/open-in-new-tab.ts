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
 * `false` quand rien n'a pu s'ouvrir (onglet refusé, URL introuvable) : l'onglet vide éventuel est
 * refermé, et c'est à l'appelant de le dire.
 */
export async function openInNewTab(resolveUrl: () => Promise<string | null>): Promise<boolean> {
  const tab = window.open("", "_blank");
  const url = await resolveUrl().catch(() => null);
  if (tab == null || url == null) {
    tab?.close();
    return false;
  }
  tab.opener = null;
  tab.location.href = url;
  return true;
}
