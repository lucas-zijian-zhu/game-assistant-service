import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AvalonModule } from './avalon/avalon.module';

@Module({
  imports: [AvalonModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
