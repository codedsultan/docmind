import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, content: string, sourceQueryId?: string) {
    return this.prisma.note.create({
      data: { userId, content, sourceQueryId },
    });
  }

  async findAll(userId: string) {
    return this.prisma.note.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const note = await this.prisma.note.findFirst({ where: { id, userId } });
    if (!note) throw new NotFoundException(`Note ${id} not found`);
    return note;
  }

  async update(userId: string, id: string, content: string) {
    await this.findOne(userId, id);
    return this.prisma.note.update({ where: { id }, data: { content } });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.note.delete({ where: { id } });
  }
}
