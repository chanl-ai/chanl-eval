/**
 * Error classes for the eval SDK.
 */

/**
 * Base error for all eval SDK errors.
 */
export class EvalApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'EvalApiError';
  }
}

/**
 * Thrown when the server returns a 401 Unauthorized response.
 */
export class EvalAuthError extends EvalApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'EvalAuthError';
  }
}

/**
 * Thrown when the server returns a 404 Not Found response.
 */
export class EvalNotFoundError extends EvalApiError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'EvalNotFoundError';
  }
}

/**
 * Thrown when waitForCompletion times out.
 */
export class EvalTimeoutError extends Error {
  constructor(
    public readonly executionId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
    this.name = 'EvalTimeoutError';
  }
}
