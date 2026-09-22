import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { ConfigService } from "../config/config.service";
import type { HealthCheckItem, HealthResponse, HealthStatus } from "./health.types";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService
  ) {}

  liveness(): HealthResponse {
    return {
      status: "ok",
      service: "aa-smart-wallet-backend",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    };
  }

  async readiness(): Promise<HealthResponse> {
    const checks = {
      database: await this.measure(() => this.checkDatabase()),
      redis: await this.measure(() => this.checkRedis()),
      config: await this.measure(() => this.checkConfig())
    };

    return {
      ...this.liveness(),
      status: this.rollupStatus(checks),
      checks
    };
  }

  private async checkDatabase(): Promise<HealthCheckItem> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }

  private async checkRedis(): Promise<HealthCheckItem> {
    const status = await this.redis.ping();
    if (status === "disabled") return { status, message: "REDIS_URL is not configured" };
    return { status };
  }

  private async checkConfig(): Promise<HealthCheckItem> {
    const config = await this.configService.getConfig();
    if (config.chains.length === 0) {
      return { status: "error", message: "No active chains available" };
    }
    return { status: "ok", message: `${config.chains.length} active chain(s)` };
  }

  private async measure(check: () => Promise<HealthCheckItem>): Promise<HealthCheckItem> {
    const started = Date.now();
    try {
      const result = await check();
      return { ...result, latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: "error",
        message: (error as Error).message,
        latencyMs: Date.now() - started
      };
    }
  }

  private rollupStatus(checks: Record<string, HealthCheckItem>): HealthStatus {
    const statuses = Object.values(checks).map((check) => check.status);
    if (statuses.includes("error")) return "error";
    if (statuses.includes("degraded")) return "degraded";
    return "ok";
  }
}
