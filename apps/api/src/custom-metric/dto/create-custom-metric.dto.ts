import { createCustomMetricSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateCustomMetricDto extends createZodDto(createCustomMetricSchema) {}
