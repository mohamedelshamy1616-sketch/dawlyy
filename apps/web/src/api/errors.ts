export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500;

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export class ApiError extends Error {
  readonly status: ApiErrorStatus;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: ApiErrorStatus, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    const error: ApiErrorBody['error'] = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export const validationError = (details?: unknown, message = 'Request validation failed') =>
  new ApiError(400, 'validation_error', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new ApiError(401, 'unauthenticated', message);

export const forbidden = (code = 'forbidden', message = 'You do not have access to this resource') =>
  new ApiError(403, code, message);

export const notFound = (message = 'Resource not found') => new ApiError(404, 'not_found', message);

export const conflict = (message = 'Request conflicts with the current state', details?: unknown) =>
  new ApiError(409, 'conflict', message, details);

export const unprocessable = (code = 'unprocessable', message = 'The requested state change is not allowed', details?: unknown) =>
  new ApiError(422, code, message, details);
