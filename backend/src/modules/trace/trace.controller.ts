import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { DEV_USER_ID } from '../../common/constants';
import { TraceService } from './trace.service';

@ApiTags('admin')
@Controller('v1/admin/traces')
export class TraceController {
  constructor(private readonly traceService: TraceService) {}

  private userId(req: Request): string {
    return (req as unknown as { userId?: string }).userId ?? DEV_USER_ID;
  }

  @Get()
  @ApiOperation({ summary: 'List query traces (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200 })
  findAll(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.traceService.findAll(
      this.userId(req),
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single trace with linked audit rows' })
  async findOne(@Param('id') id: string) {
    const trace = await this.traceService.findOne(id);
    if (!trace) throw new NotFoundException(`Trace ${id} not found`);
    return trace;
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export a trace as JSON' })
  async export(@Param('id') id: string, @Res() res: Response) {
    const trace = await this.traceService.findOne(id);
    if (!trace) throw new NotFoundException(`Trace ${id} not found`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="trace-${id}.json"`,
    );
    res.send(JSON.stringify(trace, null, 2));
  }
}
