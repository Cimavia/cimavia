import { createAccountApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache de la relation coach ↔ athlète vivent dans @cmv/shared : le mobile
// appelle exactement les mêmes (#30, #31). Ne reste ici que l'injection du client web.
export const accountApi = createAccountApi(api);

export { athleteKeys, coachKeys, invitationKeys } from "@cmv/shared";
