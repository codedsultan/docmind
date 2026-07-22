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
import { DEV_USER_ID } from '../../common/constants';
import { NotesService } from './notes.service';

export class CreateNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sourceQueryId?: string;
}

export class UpdateNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;
}

@ApiTags('notes')
@Controller('v1/notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  private userId(req: Request): string {
    return (req as unknown as { userId?: string }).userId ?? DEV_USER_ID;
  }

  @Post()
  @ApiOperation({ summary: 'Create a note' })
  @ApiBody({ type: CreateNoteDto })
  @ApiResponse({ status: 201 })
  create(@Body() dto: CreateNoteDto, @Req() req: Request) {
    return this.notesService.create(
      this.userId(req),
      dto.content,
      dto.sourceQueryId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all notes for the user' })
  findAll(@Req() req: Request) {
    return this.notesService.findAll(this.userId(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single note' })
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.notesService.findOne(this.userId(req), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update note content' })
  @ApiBody({ type: UpdateNoteDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
    @Req() req: Request,
  ) {
    return this.notesService.update(this.userId(req), id, dto.content);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a note' })
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.notesService.remove(this.userId(req), id);
  }
}
