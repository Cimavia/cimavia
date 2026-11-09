/** Ce que la décision lit d'une session : à l'exécution, sa forme n'est pas garantie (voir plus bas). */
type SessionLike = Readonly<{ user?: Readonly<{ id?: string | null }> | null }>;

/**
 * La session de `owner`, le compte sous lequel un écran a été ouvert, a-t-elle disparu (#336, #439) ?
 *
 * `null` veut dire que le serveur a répondu « personne » : c'est la perte. Une session sans
 * utilisateur lisible n'en est PAS une : Better Auth prend pour une session tout corps en 200, et
 * le portail captif d'une salle de sport renvoie sa page HTML. Demander un mot de passe là-dessus
 * punirait qui a juste un Wi-Fi à accepter.
 *
 * Un AUTRE compte vaut perte : l'écran, sa saisie et son cache sont ceux du premier.
 */
export function isSessionLost(
  owner: Readonly<{ id: string }> | null,
  session: SessionLike | null | undefined,
): boolean {
  if (owner == null) return false;
  if (session == null) return true;
  const id = session.user?.id;
  return id != null && id !== owner.id;
}
