import { Injectable, NotFoundException } from '@nestjs/common';
import * as chrono from 'chrono-node';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  parseDueAt(dueAt?: string): Date | null {
    if (!dueAt) return null;
    const parsed = chrono.parseDate(dueAt);
    return parsed ?? null;
  }

  async create(
    userId: string,
    title: string,
    description?: string,
    dueAtStr?: string,
    sourceQueryId?: string,
  ) {
    const dueAt = this.parseDueAt(dueAtStr);
    return this.prisma.task.create({
      data: { userId, title, description, dueAt, sourceQueryId },
    });
  }

  async findAll(userId: string) {
    return this.prisma.task.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async update(
    userId: string,
    id: string,
    updates: { title?: string; description?: string; dueAt?: string },
  ) {
    await this.findOne(userId, id);
    const dueAt =
      updates.dueAt !== undefined ? this.parseDueAt(updates.dueAt) : undefined;
    return this.prisma.task.update({
      where: { id },
      data: {
        title: updates.title,
        description: updates.description,
        ...(dueAt !== undefined ? { dueAt } : {}),
      },
    });
  }

  async toggleDone(userId: string, id: string) {
    const task = await this.findOne(userId, id);
    return this.prisma.task.update({
      where: { id },
      data: { done: !task.done },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.task.delete({ where: { id } });
  }
}
