import { updateCapabilitiesSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateCapabilitiesDto extends createZodDto(updateCapabilitiesSchema) {}
