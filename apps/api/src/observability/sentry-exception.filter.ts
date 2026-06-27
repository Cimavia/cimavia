import { type ArgumentsHost, Catch } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { SentryExceptionCaptured } from "@sentry/nestjs";

/**
 * Filtre d'exception global qui transmet à Sentry les erreurs *inattendues*
 * (tout ce qui n'est pas une HttpException Nest, donc les bugs/500 non maîtrisés),
 * puis délègue le rendu de la réponse au filtre par défaut de Nest.
 *
 * Le décorateur `@SentryExceptionCaptured()` ignore les erreurs attendues
 * (HttpException : 4xx, 503 santé…) pour ne pas polluer Sentry.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  @SentryExceptionCaptured()
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(exception, host);
  }
}
