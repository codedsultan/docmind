import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RiskTier } from '../../../common/constants';
import { TasksService } from '../../tasks/tasks.service';
import type { Tool, ToolContext } from '../tool.interface';

const schema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  dueAt: z.string().optional(),
});

type Params = z.infer<typeof schema>;

@Injectable()
export class CreateTaskTool implements Tool<Params> {
  readonly name = 'create_task';
  readonly description =
    'Create a task with an optional natural-language due date';
  readonly riskTier = RiskTier.internalWrite;
  readonly schema = schema;

  constructor(private readonly tasksService: TasksService) {}

  async execute(params: Params, ctx: ToolContext): Promise<unknown> {
    const task = await this.tasksService.create(
      ctx.userId,
      params.title,
      params.description,
      params.dueAt,
    );
    return { taskId: task.id, title: task.title, dueAt: task.dueAt };
  }
}
