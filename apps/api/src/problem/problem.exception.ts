import type { ProblemFieldError } from "@cmv/shared";
import { HttpException } from "@nestjs/common";

/**
 * Un refus dont le client lit la CAUSE, pas la phrase (RFC 9457, #698) : `problemType` est le
 * `type` du problème, un code (`ProblemType`) que chaque client traduit. `title` en dit la même
 * chose aux logs et à qui lit la réponse à la main.
 *
 * Sans `problemType`, un refus reste une `HttpException` ordinaire : le filtre le rend en
 * `about:blank`, avec le libellé HTTP pour titre et son message pour `detail`.
 */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    readonly problemType: string,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: ProblemFieldError[],
  ) {
    super(title, status);
  }
}
