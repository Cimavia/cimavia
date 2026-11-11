import { type ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerLimitDetail } from "@nestjs/throttler";

/**
 * `ThrottlerGuard`, avec le `Retry-After` standard (RFC 9110) sur le 429 (#782). Celui de la
 * librairie porte le nom du compteur dès qu'il n'est pas `default` — `Retry-After-upload-minute` —,
 * qu'aucun client HTTP ni proxy ne lit.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const reply = context.switchToHttp().getResponse<{ header: (n: string, v: number) => void }>();
    reply.header("Retry-After", detail.timeToBlockExpire);
    await super.throwThrottlingException(context, detail);
  }
}
