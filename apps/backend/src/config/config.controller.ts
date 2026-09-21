import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "./config.service";
import type { AppConfigResponse } from "./config.types";

@Controller("config")
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  async getConfig(): Promise<AppConfigResponse> {
    return this.configService.getConfig();
  }
}
