import { createAccountApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache de la relation coach ↔ athlète vivent dans @cmv/shared : le web
// appelle exactement les mêmes (#28). Ne reste ici que l'injection du client mobile (cookie de
// session tenu par SecureStore).
export const accountApi = createAccountApi(api);

// `invitationKeys` sert aux deux bouts : la liste du coach (`feature/athlete`) et celle qui
// attend l'athlète (#146). Même racine, donc un refus périme les deux d'un coup.
export { coachKeys, invitationKeys } from "@cmv/shared";
