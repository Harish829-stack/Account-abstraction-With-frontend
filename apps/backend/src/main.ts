import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

type RequestLike = {
  ip?: string;
  socket: { remoteAddress?: string };
  method: string;
  originalUrl: string;
};
type ResponseLike = {
  statusCode: number;
  status: (code: number) => { json: (body: unknown) => void };
  on: (event: "finish", callback: () => void) => void;
};
type NextFunction = () => void;

function parseCorsOrigins(): boolean | string[] {
  const raw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "";
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : true;
}

function createRateLimitMiddleware() {
  const maxRequests = Number(process.env.RATE_LIMIT_MAX || 0);
  if (!Number.isFinite(maxRequests) || maxRequests <= 0) return null;

  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: RequestLike, res: ResponseLike, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = hits.get(key);
    const bucket = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    hits.set(key, bucket);

    if (bucket.count > maxRequests) {
      res.status(429).json({ statusCode: 429, message: "Too many requests", error: "Too Many Requests" });
      return;
    }

    next();
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("HTTP");

  const rateLimitMiddleware = createRateLimitMiddleware();
  if (rateLimitMiddleware) app.use(rateLimitMiddleware);
  app.use((req: RequestLike, res: ResponseLike, next: NextFunction) => {
    const started = Date.now();
    res.on("finish", () => {
      logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  app.enableCors({
    origin: parseCorsOrigins(),
    credentials: true
  });

  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || "127.0.0.1";
  await app.listen(port, host);
}

void bootstrap();
