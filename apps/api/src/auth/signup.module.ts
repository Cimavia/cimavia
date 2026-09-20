import { Module } from "@nestjs/common";
import { SignupPolicy } from "./signup.policy";

/**
 * Expose `SignupPolicy` au module Better Auth, qui la reçoit par `imports` — comme `MailModule`.
 *
 * Un module d'une ligne plutôt qu'un provider de `AppModule` : les providers du module racine ne
 * sont PAS visibles de la fabrique de `BetterAuthModule.forRootAsync`, qui résout ses `inject`
 * dans son propre contexte. Ce qu'elle doit voir passe par ses `imports`, ou est global.
 */
@Module({
  providers: [SignupPolicy],
  exports: [SignupPolicy],
})
export class SignupModule {}
