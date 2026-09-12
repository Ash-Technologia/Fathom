import type { AnalysisResult } from '../core/result.js';

/**
 * JSON reporter — outputs stable, machine-readable JSON to stdout.
 *
 * All log output MUST go to stderr when this reporter is active.
 */
export class JsonReporter {
  async report(result: AnalysisResult): Promise<void> {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}
