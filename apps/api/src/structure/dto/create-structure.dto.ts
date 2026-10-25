import { structureInputSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateStructureDto extends createZodDto(structureInputSchema) {}
