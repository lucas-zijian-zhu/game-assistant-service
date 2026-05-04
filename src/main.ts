import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Server } from 'node:http';
import { AppModule } from './app.module';
import { AvalonWsHub } from './avalon/avalon.ws-hub';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
