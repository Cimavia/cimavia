import { createCapabilityApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

export { capabilityKeys } from "@cmv/shared";
export const capabilityApi = createCapabilityApi(api);
