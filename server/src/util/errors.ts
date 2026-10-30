/**
 * An error meant for the person using Refit: a plain message that says what happened, plus what
 * to do about it. Route handlers turn it into `{ error, fix }` with the given HTTP status.
 */
export class UserError extends Error {
  constructor(
    message: string,
    readonly fix?: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'UserError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
