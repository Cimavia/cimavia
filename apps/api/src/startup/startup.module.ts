import { Module } from "@nestjs/common";
import { StartupReportService } from "./startup-report.service";

@Module({
  providers: [StartupReportService],
})
export class StartupModule {}
