import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
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
      // Await inside the try block so asynchronous ioredis failures are caught.
      // Returning the promise directly lets a rejected command bypass this catch
      // and turns an optional cache outage into an HTTP 500.
      return await this.client.get(key);
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

  async ping(): Promise<"ok" | "disabled" | "error"> {
    if (!this.client) return "disabled";
    try {
      await this.connect();
      const pong = await this.client.ping();
      return pong === "PONG" ? "ok" : "error";
    } catch (error) {
      this.logger.warn(`Redis ping failed: ${(error as Error).message}`);
      return "error";
    }
  }

  // Authentication storage must fail closed; the optional cache methods above intentionally do not.
  private async authCommand<T>(operation: (client: Redis) => Promise<T>): Promise<T> {
    if (!this.client) throw new ServiceUnavailableException("Authentication storage is unavailable");
    try {
      await this.connect();
      return await operation(this.client);
    } catch {
      throw new ServiceUnavailableException("Authentication storage is unavailable");
    }
  }

  authGet(key: string): Promise<string | null> {
    return this.authCommand((client) => client.get(key));
  }

  async authSet(key: string, value: string, ttl: number): Promise<void> {
    await this.authCommand((client) => client.set(key, value, "EX", ttl));
  }

  async authDelete(key: string): Promise<void> {
    await this.authCommand((client) => client.del(key));
  }

  async authConsume(key: string): Promise<string | null> {
    return this.authCommand(async (client) => await client.eval(
      "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v",
      1, key
    ) as string | null);
  }

  async authRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
    const count = await this.authCommand(async (client) => Number(await client.eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return n",
      1, key, windowSeconds
    )));
    if (count > limit) throw new HttpException("Too many sign-in requests", HttpStatus.TOO_MANY_REQUESTS);
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
