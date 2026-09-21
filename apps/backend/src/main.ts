import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true
  });

  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || "127.0.0.1";
  await app.listen(port, host);
}

void bootstrap();
