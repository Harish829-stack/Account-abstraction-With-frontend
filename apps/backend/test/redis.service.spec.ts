import { RedisService } from "../src/redis/redis.service";

describe("RedisService", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  afterAll(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  });

  it("fails open when an asynchronous cache read is rejected", async () => {
    const service = new RedisService();
    const client = {
      status: "ready",
      get: jest.fn().mockRejectedValue(
        new Error("Stream isn't writeable and enableOfflineQueue options is false")
      )
    };
    Object.defineProperty(service, "client", { value: client });

    await expect(service.get("app_config")).resolves.toBeNull();
  });
});
