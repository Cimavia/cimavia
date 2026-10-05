import { duplicateExerciseSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class DuplicateExerciseDto extends createZodDto(duplicateExerciseSchema) {}
