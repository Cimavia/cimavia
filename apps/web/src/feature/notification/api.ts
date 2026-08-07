import { createNotificationApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache vivent dans @cmv/shared : le mobile appelle exactement les mêmes.
// Ne reste ici que l'injection du client web (cookie de session du navigateur).
export const notificationApi = createNotificationApi(api);

export { notificationKeys } from "@cmv/shared";
