import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@softema/db';
import type { ApiErrorBody, ErrorCode } from '@softema/shared';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode, message: string, readonly fields?: Record<string, string>) { super(message); }
}
export const notFound = (what = 'Záznam') => new ApiError(404, 'NOT_FOUND', `${what} neexistuje nebo k němu nemáte přístup.`);

const CONNECTION = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Can't reach database|connection (terminated|refused)/i;
const isDuplicate = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
export const isUniqueViolation = isDuplicate;

/** Single error shape for the whole API. Never echoes database messages or personal data. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('API');
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const send = (status: number, body: ApiErrorBody) => res.status(status).json(body);
    if (e instanceof ApiError) return send(e.status, { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) });
    if (e instanceof HttpException) {
      const s = e.getStatus();
      if (s === 404) return send(404, { code: 'NOT_FOUND', message: 'Adresa neexistuje.' });
      if (s < 500) return send(s, { code: 'VALIDATION_FAILED', message: 'Požadavek se nepodařilo zpracovat.' });
    }
    const name = e instanceof Error ? e.constructor.name : 'unknown';
    if (e instanceof Prisma.PrismaClientInitializationError || (e instanceof Error && CONNECTION.test(e.message))) {
      this.log.error(`Database unavailable (${name})`);
      return send(503, { code: 'SERVICE_UNAVAILABLE', message: 'Databáze je dočasně nedostupná. Zkuste to prosím znovu.' });
    }
    // Only the error class and Prisma code: messages can contain personal data.
    this.log.error(`Unhandled ${name}${e instanceof Prisma.PrismaClientKnownRequestError ? ` ${e.code}` : ''}`);
    return send(500, { code: 'INTERNAL', message: 'Něco se nepovedlo. Pokud jste něco ukládali, změna se neuložila.' });
  }
}
