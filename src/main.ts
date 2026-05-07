import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { Server } from 'node:http';
import { AppModule } from './app.module';
import { AvalonWsHub } from './avalon/avalon.ws-hub';

const DEFAULT_HTTP_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_HTTP_RATE_LIMIT_MAX = 240;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(createHttpRateLimitMiddleware());
  app.enableCors();
  app.get(AvalonWsHub).attach(app.getHttpServer() as Server);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Avalon Assistant API')
    .setDescription('阿瓦隆助手后端 API')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Player-Id',
        in: 'header',
      },
      'player-id',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();

function createHttpRateLimitMiddleware() {
  const windowMs = getNumberEnv(
    'AVALON_HTTP_RATE_LIMIT_WINDOW_MS',
    DEFAULT_HTTP_RATE_LIMIT_WINDOW_MS,
  );
  const maxRequests = getNumberEnv(
    'AVALON_HTTP_RATE_LIMIT_MAX',
    DEFAULT_HTTP_RATE_LIMIT_MAX,
  );
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (request: Request, response: Response, next: NextFunction) => {
    if (maxRequests === 0) {
      next();
      return;
    }

    const now = Date.now();
    const key = getClientIp(request);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      response.status(429).json({
        code: 'RATE_LIMITED',
        message: '请求过于频繁，请稍后再试。',
      });
      return;
    }

    if (buckets.size > 1000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      }
    }
    next();
  };
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0].split(',')[0].trim();
  }
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

function getNumberEnv(name: string, fallback: number) {
  const configured = Number(process.env[name]);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }
  return fallback;
}
