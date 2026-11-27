import { duplicatePlanSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class DuplicatePlanDto extends createZodDto(duplicatePlanSchema) {}
