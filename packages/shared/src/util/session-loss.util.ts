/**
 * La session de `owner`, le compte sous lequel un écran a été ouvert, a-t-elle disparu (#336, #439) ?
 *
 * `null` veut dire que le serveur a répondu « personne » : `refuseUnreadableSession` écarte tout ce
 * qui n'est pas une vraie réponse avant que la session n'arrive ici.
 *
 * Un AUTRE compte vaut perte : l'écran, sa saisie et son cache sont ceux du premier.
 */
export function isSessionLost(
  owner: Readonly<{ id: string }> | null,
  session: Readonly<{ user: Readonly<{ id: string }> }> | null | undefined,
): boolean {
  if (owner == null) return false;
  return session?.user.id !== owner.id;
}
