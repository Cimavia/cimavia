/**
 * L'échappement des commandes de workflow GitHub (`::error …::message`), commun aux contrôles qui
 * annotent la CI (`check:migrations`, `check:bundle`).
 */

/** Le message : `%` et les retours de ligne, qui couperaient la commande. */
export function escapeData(text) {
  return text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

/** Une propriété (`file=`, `title=`…) : en plus, `:` et `,`, qui la couperaient. */
export function escapeProperty(text) {
  return escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C");
}
