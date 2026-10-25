import { updateStructureSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateStructureDto extends createZodDto(updateStructureSchema) {}
