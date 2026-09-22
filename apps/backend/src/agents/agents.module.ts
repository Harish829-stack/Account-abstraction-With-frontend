import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentsController } from "./agents.controller";
import { AgentsRepository } from "./agents.repository";
import { AgentsService } from "./agents.service";

@Module({
  imports: [PrismaModule],
  controllers: [AgentsController],
  providers: [AgentsRepository, AgentsService]
})
export class AgentsModule {}
