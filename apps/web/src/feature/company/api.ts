import { createOrganizationApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

/**
 * L'entreprise et ses Coachs (#601), par ses deux bouts : l'entreprise qui invite, le Coach qui
 * répond. Routes et clés viennent de `@cmv/shared` — le mobile appelle les mêmes ; ne reste ici
 * que l'injection du client web.
 */
export const organizationApi = createOrganizationApi(api);

export { organizationKeys } from "@cmv/shared";
