import { PROBLEM_CONTENT_TYPE } from "@cmv/shared";
import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { type CapturedRequest, captureHttpException } from "../observability/sentry-capture";
import { problemOf, statusOf } from "./problem";

type RequestShape = CapturedRequest & { url?: string };
/** Ce que le filtre écrit sur la réponse Fastify, sans dépendre de `fastify`. */
type ReplyShape = {
  raw?: object;
  status: (code: number) => ReplyShape;
  header: (name: string, value: string) => ReplyShape;
  send: (payload: string) => unknown;
};

/**
 * Filtre d'exception global : toute exception devient un `application/problem+json` (RFC 9457,
 * #698) — l'erreur d'une route, le 404 d'une route inconnue, et les refus de Fastify qui traversent
 * aussi le filtre de Nest.
 *
 * Avant de répondre il envoie l'exception à Sentry (`captureHttpException`) et la dépose sur la
 * réponse, avec le `type` du problème, pour que la ligne de journal de la requête porte la VRAIE
 * erreur et sa cause : `pino-http` lit `res.err` à la fin de la réponse, et sans lui il fabrique
 * « failed with status code 503 ».
 */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestShape | undefined>();
    const reply = http.getResponse<ReplyShape>();
    const status = statusOf(exception);

    const problem = problemOf(exception, status, request?.url);

    captureHttpException(exception, status, request);
    // `problemType` : lu par `requestLogProps` pour la ligne de journal de la requête.
    if (reply.raw) Object.assign(reply.raw, { err: exception, problemType: problem.type });

    reply.status(status).header("content-type", PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
  }
}
