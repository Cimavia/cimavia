import { updateCustomMetricSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateCustomMetricDto extends createZodDto(updateCustomMetricSchema) {}
