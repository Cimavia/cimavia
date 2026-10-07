import { createOrganizationApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache de l'entreprise vivent dans @cmv/shared : le web appelle les mêmes
// (#601). Le mobile n'en tient que le bout Coach — l'espace Entreprise reste au web (#600).
export const organizationApi = createOrganizationApi(api);

export { organizationKeys } from "@cmv/shared";
