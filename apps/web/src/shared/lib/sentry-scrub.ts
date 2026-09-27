import { redactUrlSecrets } from "@cmv/shared";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";

// Ce qu'une URL ne doit pas emporter — jeton de réinitialisation, signature S3 — vit dans
// `@cmv/shared` depuis #433 : l'API blanchit ses journaux et ses événements avec la même liste.
// Ici, le seul problème propre au navigateur : `httpContextIntegration`, intégration PAR DÉFAUT,
// écrit `location.href` dans `event.request.url` sur tout événement, et `sendDefaultPii` n'y
// change rien — il ne joue que sur l'IP (#335).

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
