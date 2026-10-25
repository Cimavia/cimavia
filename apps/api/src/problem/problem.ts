import { STATUS_CODES } from "node:http";
import { ABOUT_BLANK, type ProblemDetails, redactUrlSecrets } from "@cmv/shared";
import { HttpException, HttpStatus } from "@nestjs/common";
import { ProblemException } from "./problem.exception";

/**
 * Le statut que la réponse portera. Une `HttpException` donne le sien ; une erreur de Fastify
 * (corps trop gros, JSON invalide, type de contenu refusé) porte `statusCode` et traverse aussi le
 * filtre de Nest : sans cette lecture, un 413 serait pris pour un bug et rendu en 500.
 */
export function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  const statusCode = (exception as { statusCode?: unknown } | null)?.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode <= 599
    ? statusCode
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

/** Le message qu'une `HttpException` porte : sa réponse est un texte, ou un objet à `message`. */
function messageOf(exception: HttpException): string | undefined {
  const response = exception.getResponse();
  if (typeof response === "string") return response;
  const { message } = response as { message?: unknown };
  if (typeof message === "string") return message;
  return Array.isArray(message) ? message.join(", ") : undefined;
}

/**
 * Le `detail`, ou rien. Une exception que personne n'a prévue n'en a pas : son message s'adresse
 * aux logs, jamais au client. Les refus de Fastify en ont un, en anglais — Nest les convertit en
 * `HttpException` avant le filtre — mais aucune app ne les provoque : ni média ni corps énorme.
 */
function detailOf(exception: unknown, title: string): string | undefined {
  if (!(exception instanceof HttpException)) return undefined;
  const message = messageOf(exception);
  // Le « Unauthorized » d'un 401 répète le titre : il n'apprend rien.
  return message === title ? undefined : message;
}

/**
 * Le problème (RFC 9457) que la réponse rend pour `exception`. `instance` est l'URL de la requête :
 * le jeton d'un appareil voyage dans le chemin, donc elle — comme `detail`, qui cite le chemin d'une
 * route inconnue — passe par `redactUrlSecrets`.
 */
export function problemOf(exception: unknown, status: number, url?: string): ProblemDetails {
  const problem: ProblemDetails = {
    type: ABOUT_BLANK,
    title: STATUS_CODES[status] ?? "Error",
    status,
  };
  if (exception instanceof ProblemException) {
    problem.type = exception.problemType;
    problem.title = exception.title;
    if (exception.errors) problem.errors = exception.errors;
  }

  const detail =
    exception instanceof ProblemException ? exception.detail : detailOf(exception, problem.title);
  if (detail !== undefined) problem.detail = redactUrlSecrets(detail);
  if (url !== undefined) problem.instance = redactUrlSecrets(url);
  return problem;
}
