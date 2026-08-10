import { createAthleteFeedbackApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache du débrief athlète vivent dans @cmv/shared : le web appelle
// exactement les mêmes (#26). Ne reste ici que l'injection du client mobile.
export const athleteFeedbackApi = createAthleteFeedbackApi(api);

export { myFeedbackKeys } from "@cmv/shared";
