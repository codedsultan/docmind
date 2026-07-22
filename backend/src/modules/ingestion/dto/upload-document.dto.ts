import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadDocumentDto {
  @ApiPropertyOptional({
    description: 'Optional document title. If omitted, derived from filename.',
    example: 'My Research Paper',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'Document visibility.',
    enum: ['private', 'public'],
    default: 'private',
  })
  @IsOptional()
  @IsEnum(['private', 'public'] as const)
  visibility?: 'private' | 'public';
}
