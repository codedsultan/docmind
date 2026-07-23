import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { DEV_USER_ID } from '../../common/constants';
import { TasksService } from './tasks.service';

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({
    required: false,
    description: 'Natural-language due date, e.g. "next Friday"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dueAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sourceQueryId?: string;
}

export class UpdateTaskDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dueAt?: string;
}

@ApiTags('tasks')
@Controller('v1/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  private userId(req: Request): string {
    return (req as unknown as { userId?: string }).userId ?? DEV_USER_ID;
  }

  @Post()
  @ApiOperation({ summary: 'Create a task' })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateTaskDto, @Req() req: Request) {
    return this.tasksService.create(
      this.userId(req),
      dto.title,
      dto.description,
      dto.dueAt,
      dto.sourceQueryId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all tasks for the user' })
  findAll(@Req() req: Request) {
    return this.tasksService.findAll(this.userId(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single task' })
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.tasksService.findOne(this.userId(req), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiBody({ type: UpdateTaskDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: Request,
  ) {
    return this.tasksService.update(this.userId(req), id, dto);
  }

  @Patch(':id/done')
  @ApiOperation({ summary: 'Toggle task done state' })
  @ApiResponse({ status: 200 })
  toggleDone(@Param('id') id: string, @Req() req: Request) {
    return this.tasksService.toggleDone(this.userId(req), id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.tasksService.remove(this.userId(req), id);
  }
}
