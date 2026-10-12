import { Global, Module } from "@nestjs/common";
import { PRISMA_LOG, PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [{ provide: PRISMA_LOG, useValue: [] }, PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
