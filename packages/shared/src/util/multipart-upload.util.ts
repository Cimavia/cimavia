import type { MultipartUploadTicket } from "../dto/upload.schema";

/**
 * La boucle d'un envoi découpé : les parts une à une, le réessai de celle qui tombe, puis la
 * clôture qui les recolle.
 *
 * Écrite ici et plus dans les apps parce qu'elle l'était QUATRE fois — débrief et messagerie ×
 * web et mobile — au caractère près, et que la règle de réessai ci-dessous est précisément le
 * genre de décision qui aurait divergé au premier ajustement appliqué d'un seul côté.
 *
 * Ce que ce module ne sait PAS, et reçoit donc de l'appelant : comment matérialiser une part et la
 * pousser (un `Blob` découpé côté web, un fichier de cache lu par plage côté mobile), et comment
 * lire ce que le storage a répondu. Ce qu'il sait, et qui ne dépend d'aucune plateforme : dans
 * quel ordre envoyer, quoi réessayer, quand renoncer.
 *
 * Le réessai ne demande aucune persistance, et c'est tout l'intérêt : pendant l'envoi,
 * l'`uploadId` et ses URLs signées — valides une heure — sont là. Ce qui jetait les parts déjà
 * montées, ce n'était pas une information perdue, c'était l'abandon au premier accroc.
 */

/**
 * Ce que le storage a répondu à une part, ramené à la seule chose dont dépend la décision de
 * réessayer : il est INJOIGNABLE, ou il a répondu et refusé.
 *
 * Les deux clients savent déjà faire cette distinction pour leurs messages d'erreur ; ils la
 * rendent maintenant sous une forme que la politique de réessai peut lire.
 */
export type PartFailure = { kind: "unreachable" } | { kind: "status"; status: number };

// Deux refus qui disent « pas maintenant » plutôt que « pas comme ça » : réessayer les corrige.
const RETRYABLE_STATUSES: readonly number[] = [408, 429];

/**
 * Réessayer a-t-il une chance de changer quelque chose ?
 *
 * Oui pour une coupure réseau et pour ce que le storage annonce comme temporaire (408, 429, 5xx).
 * Non pour tout le reste : un 403 de signature ou un 400 de taille naît d'une part qui ne
 * CONVIENT pas, et la renvoyer à l'identique produirait le même refus trois fois de suite — trois
 * fois le poids de la part, et quatre secondes de barre immobile, pour rien.
 */
export function isRetryablePartFailure(failure: PartFailure): boolean {
  if (failure.kind === "unreachable") return true;
  return RETRYABLE_STATUSES.includes(failure.status) || failure.status >= 500;
}

/**
 * Sans le moindre octet pendant ce délai, on considère la part PERDUE et on coupe nous-mêmes.
 *
 * MESURÉ sur appareil : quand le mobile passe du wifi à la 5G, la requête en cours ne casse pas —
 * elle GÈLE. Le socket reste ouvert sur une interface morte, la barre s'arrête, et rien ne rejette
 * jamais. Aucun réessai ne pouvait donc partir : il attendait une erreur qui ne venait pas. C'est
 * le mode de défaillance le plus courant, et c'était l'angle mort du premier jet de #152.
 *
 * 20 s parce que le compteur est remis à zéro à CHAQUE octet reçu : un envoi lent, mais qui
 * avance, ne le déclenche jamais. Seul un transfert réellement immobile l'atteint.
 */
export const MULTIPART_STALL_TIMEOUT_MS = 20_000;

/**
 * L'attente avant chaque nouvelle tentative. Croissante : une coupure de tunnel se rouvre en une
 * seconde, un basculement d'interface ou une sortie de zone blanche demandent bien plus.
 *
 * L'échelle a été RALLONGÉE après un essai sur appareil : coupé net (wifi et 5G), le réseau
 * revenait au-delà des quatre secondes que couvrait le premier jet, et l'envoi était déjà perdu.
 * Ces cinq paliers tiennent un peu plus d'une minute — les URLs signées valant une heure, on peut
 * se le permettre, et l'alternative est de rejeter 380 Mo pour une poche de réseau.
 */
export const MULTIPART_RETRY_DELAYS_MS: readonly number[] = [1_000, 3_000, 8_000, 20_000, 30_000];

/** Une tentative initiale, plus une par délai prévu. */
export const MULTIPART_PART_MAX_ATTEMPTS = MULTIPART_RETRY_DELAYS_MS.length + 1;

/**
 * Combien attendre après l'échec de la tentative `attempt` (1-based), ou `null` s'il n'en reste
 * aucune. `null` et non `0` : « plus de tentative » et « réessayer tout de suite » sont deux
 * choses, et les confondre ferait boucler indéfiniment sur un storage définitivement fermé.
 */
export function multipartRetryDelayMs(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 1) return null;
  return MULTIPART_RETRY_DELAYS_MS[attempt - 1] ?? null;
}

/**
 * Une part à envoyer : son rang, son URL signée, et sa plage dans le fichier source.
 *
 * `partNumber` est 1-based comme les `PartNumber` de S3, `start`/`length` sont ce que la
 * plateforme doit lire — les deux vont ensemble et ne se recalculent nulle part ailleurs.
 */
export type MultipartPart = {
  partNumber: number;
  url: string;
  start: number;
  length: number;
};

/**
 * Les parts d'un ticket, dans l'ordre. `null` si le ticket et le fichier ne parlent pas du même
 * poids — la signature aurait de toute façon été refusée part par part, autant s'en apercevoir
 * avant d'avoir poussé quoi que ce soit.
 *
 * Les plages se calculent avec le `partSize` DU TICKET et non avec `MULTIPART_PART_SIZE_BYTES`,
 * bien que la constante existe : c'est avec la valeur du ticket que le serveur a signé le
 * `ContentLength` de chaque part. Les deux coïncident aujourd'hui ; le jour où le seuil bouge,
 * lire la constante enverrait des parts d'un poids que la signature ne couvre pas.
 */
export function multipartPartsOf(
  ticket: MultipartUploadTicket,
  totalBytes: number,
): MultipartPart[] | null {
  if (!Number.isInteger(totalBytes) || totalBytes <= 0) return null;
  if (Math.ceil(totalBytes / ticket.partSize) !== ticket.partUrls.length) return null;

  return ticket.partUrls.map((url, index) => {
    const start = index * ticket.partSize;
    // La dernière part est tronquée à la fin du fichier ; les autres font exactement `partSize`.
    return {
      partNumber: index + 1,
      url,
      start,
      length: Math.min(ticket.partSize, totalBytes - start),
    };
  });
}

/**
 * Ce que l'appelant branche sous la boucle. `complete` et `abort` sont fermées sur leur portée
 * (la séance ou le fil, et le titre exercé) : la boucle n'a pas à savoir à quoi appartient l'envoi
 * qu'elle mène.
 */
/**
 * Où en est le réessai, pour que l'écran puisse le DIRE au lieu de laisser une barre immobile.
 *
 * `maxAttempts` accompagne `attempt` parce que « nouvelle tentative » sans borne inquiète autant
 * qu'un silence : c'est de savoir que ça s'arrêtera que vient le calme. `attempt` est celle qui
 * VA être tentée, pas celle qui vient d'échouer.
 */
export type MultipartRetry = { attempt: number; maxAttempts: number };

export type MultipartUploadRunner = {
  /** Matérialise la part et la pousse. `onSentBytes` compte DANS la part, pas dans le fichier. */
  sendPart: (part: MultipartPart, onSentBytes: (sentBytes: number) => void) => Promise<void>;
  /**
   * Ce que le storage a répondu, ou `null` quand l'erreur ne vient pas de lui.
   *
   * `null` veut dire « je ne sais pas d'où ça vient », pas « échec non réessayable » — les deux se
   * traitent pareil ici, mais les confondre dans la signature ferait un jour réessayer trois fois
   * un bug applicatif en croyant relancer le réseau.
   */
  failureOf: (error: unknown) => PartFailure | null;
  complete: (partCount: number) => Promise<void>;
  abort: () => Promise<void>;
  /** `null` là où aucune barre n'est nourrie — la messagerie mobile, aujourd'hui (dette U-3). */
  onProgress: ((percent: number) => void) | null;
  /**
   * Le réessai en cours, `null` dès que l'envoi reprend. Deux `null` à ne pas confondre : celui du
   * rappel lui-même veut dire « cette surface n'affiche rien », celui de son argument « on n'est
   * plus en train de réessayer ».
   *
   * Sans ce signal, un réseau vraiment mort laisse la barre figée pendant environ trois minutes
   * (six tentatives à 20 s de gel, plus une minute de paliers) sans un mot — soit exactement le
   * « c'est bloqué » qui a produit la dette U-3.
   */
  onRetry: ((retry: MultipartRetry | null) => void) | null;
  /** Point d'injection des tests : sans lui, chaque cas de réessai attendrait vraiment. */
  wait?: (delayMs: number) => Promise<void>;
};

/**
 * L'envoi découpé de bout en bout : les parts, puis la clôture.
 *
 * Tant que la clôture n'a pas eu lieu, RIEN n'existe dans le bucket — le rattachement porterait
 * sur un chemin vide. Et une part manquante produirait un objet tronqué que rien ne distingue
 * d'un objet entier, d'où le décompte que le serveur revérifie à la clôture.
 *
 * On n'abandonne QUE sur échec définitif, et c'est le changement de #152 : abandonner au premier
 * accroc jetait les parts déjà montées alors que l'upload était encore parfaitement ouvert.
 * Renvoyer une part sous le même `PartNumber` la REMPLACE côté S3 — vérifié sur MinIO : `ListParts`
 * n'en voit qu'une, et le serveur relisant les ETags lui-même, le nouveau est pris sans rien
 * changer à la clôture.
 */
export async function runMultipartUpload(
  ticket: MultipartUploadTicket,
  totalBytes: number,
  runner: MultipartUploadRunner,
): Promise<void> {
  const parts = multipartPartsOf(ticket, totalBytes);
  if (parts == null) {
    // L'upload est déjà ouvert côté storage : renoncer sans l'abandonner laisserait des parts
    // facturées, invisibles à l'inventaire des objets.
    await runner.abort().catch(() => undefined);
    throw new Error("Le ticket d'envoi découpé ne correspond pas au fichier");
  }

  const report = monotonicProgress(runner.onProgress, totalBytes);
  const reportRetry = retryReporter(runner.onRetry);
  try {
    for (const part of parts) {
      await sendPartWithRetries(part, runner, report, reportRetry);
    }
    await runner.complete(parts.length);
  } catch (error) {
    // L'échec de l'abandon est avalé : il ne doit pas masquer l'erreur d'origine, la seule sur
    // laquelle l'utilisateur peut agir.
    await runner.abort().catch(() => undefined);
    throw error;
  }
}

async function sendPartWithRetries(
  part: MultipartPart,
  runner: MultipartUploadRunner,
  report: (sentBytes: number) => void,
  reportRetry: (retry: MultipartRetry | null) => void,
): Promise<void> {
  const wait = runner.wait ?? sleep;

  for (let attempt = 1; ; attempt += 1) {
    try {
      await runner.sendPart(part, (sentBytes) => report(part.start + sentBytes));
      // La part est passée : l'écran doit cesser d'annoncer un réessai, même si les suivantes
      // retomberont peut-être dessus.
      reportRetry(null);
      // La progression peut s'arrêter avant le dernier octet : on cale sur la fin de la part,
      // sinon une barre resterait bloquée à 98 % sur un envoi pourtant terminé.
      report(part.start + part.length);
      return;
    } catch (error) {
      const failure = runner.failureOf(error);
      const delayMs =
        failure != null && isRetryablePartFailure(failure) ? multipartRetryDelayMs(attempt) : null;
      // L'erreur d'ORIGINE est relancée, jamais une erreur de synthèse : c'est elle qui porte le
      // libellé que le débrief ou la messagerie sait traduire.
      if (delayMs == null) throw error;
      reportRetry({ attempt: attempt + 1, maxAttempts: MULTIPART_PART_MAX_ATTEMPTS });
      await wait(delayMs);
    }
  }
}

/**
 * La progression sur le TOTAL du fichier, et qui ne recule jamais.
 *
 * Un réessai renvoie la part depuis son premier octet : rapportée telle quelle, la barre
 * reculerait de dix mégaoctets à chaque accroc. Elle TIENT à la place — l'utilisateur voit un
 * envoi qui marque une pause, ce qui est exactement ce qui se passe, là où un recul lui ferait
 * croire à un envoi qui recommence.
 */
function monotonicProgress(
  onProgress: ((percent: number) => void) | null,
  totalBytes: number,
): (sentBytes: number) => void {
  let highest = 0;
  return (sentBytes) => {
    if (onProgress == null) return;
    const percent = uploadPercentOf(sentBytes, totalBytes);
    if (percent <= highest) return;
    highest = percent;
    onProgress(percent);
  };
}

/**
 * Le réessai courant, sans répéter deux fois la même chose : l'écran n'a pas à se redessiner parce
 * que la part 12 réessaie au même rang que la part 11.
 */
function retryReporter(
  onRetry: ((retry: MultipartRetry | null) => void) | null,
): (retry: MultipartRetry | null) => void {
  let last: MultipartRetry | null = null;
  return (retry) => {
    if (onRetry == null) return;
    if (last?.attempt === retry?.attempt) return;
    last = retry;
    onRetry(retry);
  };
}

/**
 * Le pourcentage d'un envoi. Écrit ici parce que les deux apps l'avaient chacune, à l'identique,
 * et que le PUT unique s'en sert aussi.
 */
export function uploadPercentOf(sentBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 100;
  return Math.min(100, Math.round((sentBytes / totalBytes) * 100));
}

/**
 * L'attente par défaut, que les tests remplacent.
 *
 * `setTimeout` est atteint par `globalThis` et non appelé directement : ce paquet ne déclare que
 * `ES2023` — ni DOM, ni Node — parce qu'il est consommé par trois runtimes (NestJS, un navigateur,
 * Hermes). Tous les trois l'offrent ; c'est la lib TypeScript, volontairement étroite, qui ne le
 * connaît pas. Élargir `lib` pour cette seule ligne ferait entrer tout le DOM dans un paquet qui
 * n'en veut pas.
 */
function sleep(delayMs: number): Promise<void> {
  const timer = (globalThis as unknown as { setTimeout: (fn: () => void, ms: number) => unknown })
    .setTimeout;
  return new Promise((resolve) => timer(() => resolve(), delayMs));
}
