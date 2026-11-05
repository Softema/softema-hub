import type { z } from 'zod';
import { ApiError } from './errors';

/** Validates input at the API boundary and reports errors per field in Czech. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) fields[i.path.join('.') || '_'] ??= i.code === 'unrecognized_keys' ? 'Nepovolené pole.' : i.message;
  throw new ApiError(422, 'VALIDATION_FAILED', Object.values(fields)[0] ?? 'Neplatný vstup.', fields);
}
