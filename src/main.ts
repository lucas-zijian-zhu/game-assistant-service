import { NestFactory } from '@nestjs/core';
import { Server } from 'node:http';
import { AppModule } from './app.module';
import { AvalonWsHub } from './avalon/avalon.ws-hub';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.get(AvalonWsHub).attach(app.getHttpServer() as Server);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
