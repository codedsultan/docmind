import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotesController],
  providers: [NotesService, AuthGuard],
  exports: [NotesService],
})
export class NotesModule {}
