import { NestFactory } from '@nestjs/core';
import { Server } from 'node:http';
import { AppModule } from './app.module';
import { AvalonWsHub } from './avalon/avalon.ws-hub';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.get(AvalonWsHub).attach(app.getHttpServer() as Server);

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();
