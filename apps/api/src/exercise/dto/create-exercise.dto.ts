import { createExerciseSchema } from "@cmv/shared";
import { createZodDto } from "../../zod/zod.util";

export class CreateExerciseDto extends createZodDto(createExerciseSchema) {}
