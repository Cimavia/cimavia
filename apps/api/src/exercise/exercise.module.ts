import { Module } from "@nestjs/common";
import { ExerciseController } from "./controller/exercise.controller";
import { ExerciseService } from "./service/exercise.service";

@Module({
  controllers: [ExerciseController],
  providers: [ExerciseService],
})
export class ExerciseModule {}
