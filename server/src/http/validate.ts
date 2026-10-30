import type { z } from 'zod';
import { UserError } from '../util/errors.js';

/** Parses a request body with a zod schema and turns problems into one readable message. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const problems = result.error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
    .join('; ');
  throw new UserError(`The request was not valid (${problems}).`, 'Correct the highlighted fields and try again.');
}
