/**
 * Ce que le SDK Sentry collecte, pour l'API comme pour le web (#669) — l'option `dataCollection`.
 *
 * Écrit EN ENTIER plutôt que laissé à ses défauts : la v11 a remplacé `sendDefaultPii` par cette
 * liste, et ses défauts envoient tout — corps des requêtes et des réponses, cookies, paramètres des
 * requêtes à la base, variables locales des stacks. Chaque clé est posée à ce que la v10 envoyait :
 * les en-têtes et la chaîne de requête, que `redactUrlSecrets` et les `beforeSend*` blanchissent
 * ensuite ; aucun corps, aucun cookie, nulle part.
 *
 * Une seule clé diffère d'une couche à l'autre, `userInfo` — l'IP (#183) : l'API l'envoie, le web
 * non. Les deux appelants le disent, et la liste ne peut pas dériver de l'une à l'autre.
 *
 * Une clé que la prochaine majeure ajoutera partira à son défaut : c'est la relecture de cette
 * majeure qui la verra.
 */
export function sentryDataCollection({ userInfo }: { userInfo: boolean }) {
  return {
    userInfo,
    httpHeaders: true,
    urlQueryParams: true,
    cookies: false,
    httpBodies: [],
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    // Le défaut de la v10 ; la v11 est descendue à 5.
    frameContextLines: 7,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    // Arrivée en 11.11. Absente, elle retomberait sur `genAI`, déjà coupé : posée quand même, la
    // liste reste complète, et le `satisfies Required<…>` de l'API la réclame.
    mcp: { inputs: false, outputs: false },
  };
}
