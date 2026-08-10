import { type Capabilities, capabilitiesOf } from "@cmv/shared";
import { authClient } from "@/shared/lib/auth";

/**
 * Les capacités du compte connecté, plus les deux états que la session peut avoir en plus de son
 * contenu. Jumeau exact de `apps/web/src/shared/hook/useCapabilities.ts` — et volontairement non
 * partagé : `authClient` diffère (cookie de navigateur contre SecureStore), et c'est tout ce que
 * ces deux fichiers contiennent en propre. Ce qui compte, la dérivation, vit dans `@cmv/shared`.
 */
export type SessionCapabilities = Capabilities & {
  /** La session n'est pas encore résolue — ne rien décider tant que c'est vrai. */
  isPending: boolean;
  /** Session résolue ET présente. Distinct de « aucune capacité ». */
  isAuthenticated: boolean;
};

export function useCapabilities(): SessionCapabilities {
  const { data, isPending } = authClient.useSession();
  return { ...capabilitiesOf(data?.user), isPending, isAuthenticated: data != null };
}
