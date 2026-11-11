import { type Capabilities, capabilitiesOf } from "@cmv/shared";
import { useRetainedAccount } from "@/shared/hook/useSessionGuard";
import { authClient } from "@/shared/lib/auth";

/**
 * Les capacités du compte connecté, plus les deux états que la session peut avoir en plus de son
 * contenu. Jumeau de `apps/web/src/shared/hook/useCapabilities.ts`, volontairement non partagé :
 * `authClient` diffère (cookie de navigateur contre SecureStore), et le mobile répond en plus pour
 * un compte retenu. Ce qui compte, la dérivation, vit dans `@cmv/shared`.
 */
export type SessionCapabilities = Capabilities & {
  /** La session n'est pas encore résolue — ne rien décider tant que c'est vrai. */
  isPending: boolean;
  /** Session résolue ET présente. Distinct de « aucune capacité ». */
  isAuthenticated: boolean;
};

export function useCapabilities(): SessionCapabilities {
  const { data, isPending } = authClient.useSession();
  // Session perdue sous un écran ouvert (#439) : rien ne doit rediriger, ni attendre une relecture
  // dont `isPending` repasserait à vrai — l'écran serait démonté, sa saisie avec.
  const retained = useRetainedAccount();
  if (retained != null)
    return { ...capabilitiesOf(retained), isPending: false, isAuthenticated: true };
  return { ...capabilitiesOf(data?.user), isPending, isAuthenticated: data != null };
}
