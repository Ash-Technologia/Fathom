/**
 * Metadata and runtime state extracted from GitHub Actions environment.
 */
export interface GitHubContext {
  /** True if running inside a GitHub Actions workflow */
  isGitHubActions: boolean;
  /** Name of the webhook event that triggered the workflow (e.g. 'pull_request', 'push') */
  eventName?: string | undefined;
  /** GitHub repository in 'owner/repo' format */
  repository?: string | undefined;
  /** Pull request number if triggered by a pull_request event */
  prNumber?: number | undefined;
  /** Base branch or ref name for pull request (e.g. 'main') */
  baseRef?: string | undefined;
  /** Head branch or ref name for pull request */
  headRef?: string | undefined;
  /** Absolute path to the file specified in $GITHUB_STEP_SUMMARY */
  stepSummaryPath?: string | undefined;
  /** Authentication token from $GITHUB_TOKEN if provided */
  token?: string | undefined;
}

/**
 * Result of posting a comment to a GitHub PR.
 */
export interface CommentResult {
  success: boolean;
  commentId?: number | undefined;
  error?: string | undefined;
}
