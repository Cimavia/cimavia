import { updateExerciseSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class UpdateExerciseDto extends createZodDto(updateExerciseSchema) {}
