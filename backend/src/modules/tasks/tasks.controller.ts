import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
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
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a task' })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({ status: 201 })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(
      user.sub,
      dto.title,
      dto.description,
      dto.dueAt,
      dto.sourceQueryId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all tasks for the user' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.tasksService.findAll(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single task' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiBody({ type: UpdateTaskDto })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.sub, id, dto);
  }

  @Patch(':id/done')
  @ApiOperation({ summary: 'Toggle task done state' })
  @ApiResponse({ status: 200 })
  toggleDone(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.toggleDone(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a task' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tasksService.remove(user.sub, id);
  }
}
