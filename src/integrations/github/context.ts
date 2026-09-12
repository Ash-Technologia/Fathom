import fs from 'node:fs/promises';
import type { GitHubContext, CommentResult } from './types.js';

/**
 * Safely detect GitHub Actions environment variables and event payload.
 * Never throws — returns safe defaults if not in GitHub Actions.
 */
export async function detectGitHubContext(): Promise<GitHubContext> {
  const isGitHubActions = process.env['GITHUB_ACTIONS'] === 'true';
  const eventName = process.env['GITHUB_EVENT_NAME'];
  const repository = process.env['GITHUB_REPOSITORY'];
  const baseRef = process.env['GITHUB_BASE_REF'];
  const headRef = process.env['GITHUB_HEAD_REF'];
  const stepSummaryPath = process.env['GITHUB_STEP_SUMMARY'];
  const token = process.env['GITHUB_TOKEN'];

  let prNumber: number | undefined = undefined;

  // Try extracting PR number from event payload if available
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (eventPath) {
    try {
      const eventRaw = await fs.readFile(eventPath, 'utf8');
      const eventData = JSON.parse(eventRaw) as {
        pull_request?: { number?: number };
        number?: number;
        issue?: { number?: number };
      };
      if (typeof eventData?.pull_request?.number === 'number') {
        prNumber = eventData.pull_request.number;
      } else if (typeof eventData?.number === 'number') {
        prNumber = eventData.number;
      } else if (typeof eventData?.issue?.number === 'number') {
        prNumber = eventData.issue.number;
      }
    } catch {
      // Ignore unreadable or invalid event file
    }
  }

  return {
    isGitHubActions,
    eventName,
    repository,
    prNumber,
    baseRef,
    headRef,
    stepSummaryPath,
    token,
  };
}

/**
 * Append a Markdown summary to GitHub Actions step summary file.
 * Returns true if written, false if no summary path was found.
 */
export async function publishStepSummary(markdown: string, customPath?: string): Promise<boolean> {
  const targetPath = customPath ?? process.env['GITHUB_STEP_SUMMARY'];
  if (!targetPath) {
    return false;
  }

  try {
    await fs.appendFile(targetPath, `${markdown}\n\n`, 'utf8');
    return true;
  } catch (err) {
    process.stderr.write(
      `[Fathom] Warning: Failed to write to GitHub step summary (${targetPath}): ${String(err)}\n`,
    );
    return false;
  }
}

/**
 * Post a comment to a GitHub pull request using the GitHub REST API.
 * Never leaks credentials in error logs or stdout.
 */
export async function publishPRComment(options: {
  repository: string;
  prNumber: number;
  token: string;
  body: string;
}): Promise<CommentResult> {
  const { repository, prNumber, token, body } = options;

  if (!repository || !prNumber || !token) {
    return {
      success: false,
      error: 'Missing repository, pull request number, or GitHub token.',
    };
  }

  const url = `https://api.github.com/repos/${repository}/issues/${prNumber}/comments`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Fathom-PR-Intelligence/0.1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      const statusText = response.statusText;
      return {
        success: false,
        error: `GitHub API error (HTTP ${response.status}: ${statusText})`,
      };
    }

    const data = (await response.json()) as { id?: number };
    return {
      success: true,
      commentId: data?.id,
    };
  } catch (err) {
    // Sanitize any error message to ensure token is never printed
    let safeMessage = String(err);
    if (token && safeMessage.includes(token)) {
      safeMessage = safeMessage.replaceAll(token, '***TOKEN***');
    }
    return {
      success: false,
      error: `Network error posting PR comment: ${safeMessage}`,
    };
  }
}
