import { createReminderApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache vivent dans @cmv/shared depuis #45 : le web appelle exactement les
// mêmes. La promotion avait été faite AVANT ce second client, précisément pour qu'il n'ait plus
// qu'un écran à écrire. Ne reste ici que l'injection du client mobile (session en SecureStore).
export const reminderApi = createReminderApi(api);

export { reminderKeys } from "@cmv/shared";
