import { Module } from '@nestjs/common';
import { AvalonController } from './avalon.controller';
import { AvalonService } from './avalon.service';
import { AvalonWsHub } from './avalon.ws-hub';

@Module({
  controllers: [AvalonController],
  providers: [AvalonService, AvalonWsHub],
  exports: [AvalonWsHub],
})
export class AvalonModule {}
