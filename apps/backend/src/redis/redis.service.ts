import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    this.client = this.createClient(redisUrl);
    this.client?.on("error", (error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      await this.connect();
      return this.client.get(key);
    } catch (error) {
      this.logger.warn(`Redis get failed for ${key}: ${(error as Error).message}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.connect();
      await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis set failed for ${key}: ${(error as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.connect();
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Redis del failed for ${key}: ${(error as Error).message}`);
    }
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    if (!this.client) return;
    try {
      await this.connect();
      await this.client.publish(channel, JSON.stringify(payload));
    } catch (error) {
      this.logger.warn(`Redis publish failed for ${channel}: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
    }
  }

  private async connect(): Promise<void> {
    if (this.client && this.client.status === "wait") {
      await this.client.connect();
    }
  }

  private createClient(redisUrl: string | undefined): Redis | null {
    if (!redisUrl) return null;

    try {
      const parsed = new URL(redisUrl);
      if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
        this.logger.warn(`Ignoring REDIS_URL with unsupported protocol: ${parsed.protocol}`);
        return null;
      }
    } catch (error) {
      this.logger.warn(`Ignoring invalid REDIS_URL: ${(error as Error).message}`);
      return null;
    }

    return new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
  }
}
