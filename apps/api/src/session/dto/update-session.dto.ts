import { updateSessionSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateSessionDto extends createZodDto(updateSessionSchema) {}
