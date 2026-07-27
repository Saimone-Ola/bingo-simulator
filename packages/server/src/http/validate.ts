import type { ZodType } from 'zod';
import { AppError } from '../errors';

/**
 * Validates a request payload and converts a Zod failure into the API's
 * field-level validation error. Every route body goes through this: the server
 * never assumes the client sent what the client claims it sent.
 */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
  }
  throw AppError.validation('Request payload failed validation', fields);
}
