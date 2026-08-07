import { createReminderApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache vivent dans @cmv/shared : le mobile appellera exactement les mêmes
// (#46). Ne reste ici que l'injection du client web (cookie de session du navigateur).
export const reminderApi = createReminderApi(api);

export { reminderKeys } from "@cmv/shared";
