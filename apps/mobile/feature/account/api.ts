import { createAccountApi, createCapabilityApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

export { capabilityKeys, counterpartKeys } from "@cmv/shared";
export const capabilityApi = createCapabilityApi(api);

// Le même module qu'appellent `feature/athlete` et `feature/coach`, chacun pour sa moitié de la
// relation. Ici pour la seule route qui n'en est d'aucune : les contreparties du COMPTE (#198).
export const accountApi = createAccountApi(api);
