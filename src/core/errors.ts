/**
 * Custom error types for Fathom.
 */

/**
 * Thrown when the CLI receives invalid arguments or options.
 * Results in exit code 2.
 */
export class FathomUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FathomUsageError';
  }
}

/**
 * Thrown when a repository cannot be accessed or read.
 * Results in exit code 3.
 */
export class FathomRepositoryError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = 'FathomRepositoryError';
  }
}

/**
 * Thrown when configuration is invalid.
 * Results in exit code 2.
 */
export class FathomConfigError extends Error {
  constructor(
    message: string,
    public readonly configPath?: string,
  ) {
    super(message);
    this.name = 'FathomConfigError';
  }
}

/**
 * Thrown by an individual analyzer on failure.
 * Caught by the orchestrator; never propagated to the top level.
 */
export class AnalyzerError extends Error {
  constructor(
    message: string,
    public readonly analyzerId: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AnalyzerError';
  }
}
