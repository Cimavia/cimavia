import { Module } from "@nestjs/common";
import { SessionController } from "./controller/session.controller";
import { SessionService } from "./service/session.service";

@Module({
  controllers: [SessionController],
  providers: [SessionService],
})
export class SessionModule {}
