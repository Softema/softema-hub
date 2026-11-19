import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { segmentCreateSchema, segmentPreviewSchema, segmentUpdateSchema } from '@softema/shared';
import { type Actor, CurrentActor, Requires, SessionGuard, WorkspaceGuard } from '../common/guards';
import { parse } from '../common/validate';
import { SegmentsService } from './segments.service';

/** Segments are filters over contacts: reading needs contact:read, saving or deleting a filter contact:write. */
@Controller('api/v1/workspaces/:workspaceId/segments')
@UseGuards(SessionGuard, WorkspaceGuard)
export class SegmentsController {
  constructor(@Inject(SegmentsService) private readonly segments: SegmentsService) {}

  @Get() @Requires('contact:read')
  list(@CurrentActor() a: Actor) { return this.segments.list(a); }
  @Post('preview') @HttpCode(200) @Requires('contact:read')
  preview(@CurrentActor() a: Actor, @Body() b: unknown) { return this.segments.preview(a, parse(segmentPreviewSchema, b)); }
  @Post() @Requires('contact:write')
  create(@CurrentActor() a: Actor, @Body() b: unknown) { return this.segments.create(a, parse(segmentCreateSchema, b)); }
  @Get(':id') @Requires('contact:read')
  detail(@CurrentActor() a: Actor, @Param('id') id: string) { return this.segments.detail(a, id); }
  @Patch(':id') @Requires('contact:write')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body() b: unknown) { return this.segments.update(a, id, parse(segmentUpdateSchema, b)); }
  @Delete(':id') @HttpCode(204) @Requires('contact:write')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) { return this.segments.remove(a, id); }
}
