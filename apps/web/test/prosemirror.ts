/**
 * ProseMirror mesure l'écran pour faire défiler jusqu'au curseur et placer un clic : jsdom n'a pas
 * de mise en page, et ces trois appels n'y existent pas. Des mesures nulles suffisent — ce qui
 * s'éprouve avec un éditeur réel est le DOCUMENT produit, pas la géométrie.
 *
 * À appeler dans un `beforeAll` : les prototypes sont ceux du jsdom du fichier de test.
 */
export function installProseMirrorLayout() {
  const empty = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => ({ ...empty, toJSON: () => empty }) as DOMRect;
  document.elementFromPoint = () => null;
}
