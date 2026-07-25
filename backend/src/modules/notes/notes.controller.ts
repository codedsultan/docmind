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

  @Post()
  @ApiOperation({ summary: 'Create a note' })
  @ApiBody({ type: CreateNoteDto })
  @ApiResponse({ status: 201 })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateNoteDto) {
    return this.notesService.create(user.sub, dto.content, dto.sourceQueryId);
  }

  @Get()
  @ApiOperation({ summary: 'List all notes for the user' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.notesService.findAll(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single note' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notesService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update note content' })
  @ApiBody({ type: UpdateNoteDto })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notesService.update(user.sub, id, dto.content);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a note' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notesService.remove(user.sub, id);
  }
}
