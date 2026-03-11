/**
 * processor error hierarchy.
 *
 * ProcessorError  -- base class for all processor errors.
 * ValidationError -- non-retriable; bad job data that will never succeed on retry.
 * TransientError  -- retriable; network blip, timeout, or temporary downstream failure.
 *
 * Object.setPrototypeOf is called in every constructor to maintain the prototype
 * chain correctly when TypeScript compiles down to ES5/CommonJS targets.
 */

export class ProcessorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessorError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends ProcessorError {
  readonly retriable = false as const;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TransientError extends ProcessorError {
  readonly retriable = true as const;

  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
