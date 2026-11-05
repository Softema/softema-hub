import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { contactCreateSchema, contactListQuerySchema, contactUpdateSchema, noteBodySchema, tagAddSchema } from '@softema/shared';
import { type Actor, CurrentActor, Requires, SessionGuard, WorkspaceGuard } from '../common/guards';
import { parse } from '../common/validate';
import { ContactsService } from './contacts.service';

@Controller('api/v1/workspaces/:workspaceId')
@UseGuards(SessionGuard, WorkspaceGuard)
export class ContactsController {
  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}

  @Get('contacts') @Requires('contact:read')
  list(@CurrentActor() a: Actor, @Query() q: unknown) { return this.contacts.list(a, parse(contactListQuerySchema, q)); }
  @Post('contacts') @Requires('contact:write')
  create(@CurrentActor() a: Actor, @Body() b: unknown) { return this.contacts.create(a, parse(contactCreateSchema, b)); }
  @Get('contacts/:id') @Requires('contact:read')
  detail(@CurrentActor() a: Actor, @Param('id') id: string) { return this.contacts.detail(a, id); }
  @Patch('contacts/:id') @Requires('contact:write')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body() b: unknown) { return this.contacts.update(a, id, parse(contactUpdateSchema, b)); }
  @Delete('contacts/:id') @HttpCode(204) @Requires('contact:delete')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) { return this.contacts.remove(a, id); }

  @Get('tags') @Requires('contact:read')
  tags(@CurrentActor() a: Actor) { return this.contacts.tags(a); }
  @Post('contacts/:id/tags') @Requires('contact:write')
  addTag(@CurrentActor() a: Actor, @Param('id') id: string, @Body() b: unknown) { return this.contacts.addTag(a, id, parse(tagAddSchema, b).name); }
  @Delete('contacts/:id/tags/:tagId') @HttpCode(204) @Requires('contact:write')
  removeTag(@CurrentActor() a: Actor, @Param('id') id: string, @Param('tagId') tagId: string) { return this.contacts.removeTag(a, id, tagId); }

  @Post('contacts/:id/notes') @Requires('contact:write')
  addNote(@CurrentActor() a: Actor, @Param('id') id: string, @Body() b: unknown) { return this.contacts.addNote(a, id, parse(noteBodySchema, b).body); }
  @Patch('contacts/:id/notes/:noteId') @Requires('contact:write')
  updateNote(@CurrentActor() a: Actor, @Param('id') id: string, @Param('noteId') noteId: string, @Body() b: unknown) { return this.contacts.updateNote(a, id, noteId, parse(noteBodySchema, b).body); }
  @Delete('contacts/:id/notes/:noteId') @HttpCode(204) @Requires('contact:write')
  removeNote(@CurrentActor() a: Actor, @Param('id') id: string, @Param('noteId') noteId: string) { return this.contacts.removeNote(a, id, noteId); }

  @Get('contacts/:id/activities') @Requires('contact:read')
  activities(@CurrentActor() a: Actor, @Param('id') id: string, @Query('cursor') cursor?: string) { return this.contacts.activities(a, id, cursor); }
}
