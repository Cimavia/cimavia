import type { Breadcrumb, ErrorEvent } from "@sentry/react";

/**
 * Ce qu'un événement Sentry ne doit JAMAIS emporter d'une URL (#335).
 *
 * `httpContextIntegration`, intégration PAR DÉFAUT du SDK navigateur, écrit `location.href` dans
 * `event.request.url` sur tout événement — `sendDefaultPii` n'y change rien, il ne joue que sur
 * l'IP. Or `/reset-password?token=…` porte de quoi prendre le contrôle d'un compte, et une URL
 * signée (`X-Amz-Signature`) de quoi lire ou écrire un média sans être connecté. `code` est
 * défensif : aucune route ne le porte aujourd'hui, c'est le nom qu'un futur lien magique prendrait.
 *
 * Le NOM du paramètre reste, seule sa valeur part : un événement qui dit « il y avait un jeton »
 * se diagnostique mieux qu'une URL tronquée.
 */
const SECRET_PARAM = /([?&](?:token|code|x-amz-signature)=)[^&#\s]*/gi;

export const FILTERED = "[Filtered]";

export function redactUrlSecrets(text: string): string {
  return text.replace(SECRET_PARAM, `$1${FILTERED}`);
}

/**
 * Les champs d'un fil d'Ariane qui portent une URL : `url` pour fetch/XHR (les PUT signés de
 * `upload.ts`), `from`/`to` pour la navigation — y compris le `replaceState` qui retire le jeton
 * de la barre d'adresse, dont le `from` le contient encore.
 */
const BREADCRUMB_URL_KEYS = ["url", "from", "to"] as const;

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data && { ...breadcrumb.data };
  if (data) {
    for (const key of BREADCRUMB_URL_KEYS) {
      const value = data[key];
      if (typeof value === "string") data[key] = redactUrlSecrets(value);
    }
  }
  return {
    ...breadcrumb,
    ...(breadcrumb.message !== undefined && { message: redactUrlSecrets(breadcrumb.message) }),
    ...(data && { data }),
  };
}

/**
 * Le `beforeSend` du web. Il passe APRÈS `httpContextIntegration` (un `preprocessEvent`), donc
 * voit bien l'URL qu'elle a posée. Le `Referer` suit le même traitement : c'est une URL aussi.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request && { ...event.request };
  if (request?.url) request.url = redactUrlSecrets(request.url);
  if (request?.headers?.Referer) {
    request.headers = { ...request.headers, Referer: redactUrlSecrets(request.headers.Referer) };
  }
  return {
    ...event,
    ...(request && { request }),
    ...(event.breadcrumbs && { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) }),
  };
}
