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

/**
 * Base error for baseline operations.
 */
export class FathomBaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FathomBaselineError';
  }
}

/**
 * Thrown when a requested baseline file does not exist.
 * Results in exit code 2.
 */
export class FathomBaselineMissingError extends FathomBaselineError {
  constructor(public readonly baselinePath: string) {
    super(
      `Baseline file not found at ${baselinePath}.\nRun "fathom --baseline" to create an initial baseline.`,
    );
    this.name = 'FathomBaselineMissingError';
  }
}

/**
 * Thrown when a baseline file cannot be parsed or has an invalid schema.
 * Results in exit code 2.
 */
export class FathomBaselineCorruptError extends FathomBaselineError {
  constructor(
    public readonly baselinePath: string,
    public readonly reason: string,
  ) {
    super(
      `Baseline file at ${baselinePath} is invalid or corrupted: ${reason}.\nRun "fathom --baseline" to regenerate the baseline.`,
    );
    this.name = 'FathomBaselineCorruptError';
  }
}

/**
 * Thrown when a Git diff operation fails or a base ref cannot be resolved.
 * Results in exit code 2.
 */
export class FathomGitDiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FathomGitDiffError';
  }
}

/**
 * Thrown when a plugin is malformed, has colliding rules/analyzers, or fails validation.
 * Results in exit code 2.
 */
export class FathomPluginError extends Error {
  constructor(
    message: string,
    public readonly pluginName?: string,
  ) {
    super(message);
    this.name = 'FathomPluginError';
  }
}
