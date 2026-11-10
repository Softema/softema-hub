import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { invitationAcceptSchema, invitationCreateSchema, invitationTokenSchema, memberRoleSchema } from '@softema/shared';
import { type Actor, CurrentActor, isUuid, OriginGuard, Requires, SessionGuard, WorkspaceGuard } from '../common/guards';
import { notFound } from '../common/errors';
import { parse } from '../common/validate';
import { TeamService } from './team.service';

@Controller('api/v1/workspaces/:workspaceId')
@UseGuards(SessionGuard, WorkspaceGuard)
export class TeamController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get('members') @Requires('team:read')
  members(@CurrentActor() a: Actor) { return this.team.members(a); }
  @Patch('members/:userId') @Requires('team:manage')
  setRole(@CurrentActor() a: Actor, @Param('userId') userId: string, @Body() b: unknown) { return this.team.setRole(a, userId, parse(memberRoleSchema, b).role).then(() => this.team.members(a)); }
  @Delete('members/:userId') @HttpCode(204) @Requires('team:manage')
  remove(@CurrentActor() a: Actor, @Param('userId') userId: string) { return this.team.removeMember(a, userId); }

  @Get('invitations') @Requires('team:manage')
  invitations(@CurrentActor() a: Actor) { return this.team.invitations(a); }
  @Post('invitations') @Requires('team:manage')
  invite(@CurrentActor() a: Actor, @Body() b: unknown) { return this.team.invite(a, parse(invitationCreateSchema, b)); }
  @Delete('invitations/:id') @HttpCode(204) @Requires('team:manage')
  revoke(@CurrentActor() a: Actor, @Param('id') id: string) {
    if (!isUuid(id)) throw notFound('Pozvánka');
    return this.team.revokeInvitation(a, id);
  }
}

/** Opened from the e-mail link, often without a session. The token travels in the body, never in the URL. */
@Controller('api/v1/invitations')
@UseGuards(OriginGuard)
export class InvitationsController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Post('preview') @HttpCode(200)
  preview(@Body() b: unknown) { return this.team.preview(parse(invitationTokenSchema, b).token); }
  @Post('accept') @HttpCode(200)
  accept(@Body() b: unknown, @Req() req: Request) { return this.team.accept(parse(invitationAcceptSchema, b), req.headers); }
}
