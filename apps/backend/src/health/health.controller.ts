import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service";
import type { HealthResponse } from "./health.types";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  liveness(): HealthResponse {
    return this.healthService.liveness();
  }

  @Get("ready")
  readiness(): Promise<HealthResponse> {
    return this.healthService.readiness();
  }
}
