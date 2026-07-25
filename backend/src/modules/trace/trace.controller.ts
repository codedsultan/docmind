import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentUser,
  JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { TraceService } from './trace.service';

@ApiTags('admin')
@Controller('v1/admin/traces')
export class TraceController {
  constructor(private readonly traceService: TraceService) {}

  @Get()
  @ApiOperation({ summary: 'List query traces (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200 })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.traceService.findAll(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single trace with linked audit rows' })
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const trace = await this.traceService.findOne(id, user.sub);
    if (!trace) throw new NotFoundException(`Trace ${id} not found`);
    return trace;
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export a trace as JSON' })
  async export(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const trace = await this.traceService.findOne(id, user.sub);
    if (!trace) throw new NotFoundException(`Trace ${id} not found`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="trace-${id}.json"`,
    );
    res.send(JSON.stringify(trace, null, 2));
  }
}
