import { createAthletePlanApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache de la lecture athlète vivent dans @cmv/shared : le web appelle
// exactement les mêmes (#25). Ne reste ici que l'injection du client mobile.
// Ce sont ces clés qui sont persistées sur le disque (lecture hors-ligne).
export const athletePlanApi = createAthletePlanApi(api);

export { myPlanKeys } from "@cmv/shared";
